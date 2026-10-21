/* WordWell Bible landing page · The Inscription.
   A stone wall in the dark with John 1:1 carved into it in Greek capitals, each λόγος inlaid in gold. The visitor's
   pointer is a torch; where its light falls on a gilded ΛΟΓΟΣ, the Greek gives way to WORD, cut and gilded in its place.
   Scrolling walks through the arched doorway and down a hall of columns (site.js sets each stop's words over it), and on
   out into daylight. Everything is generated here (no model or image files): carving relief, masonry, slabs and fluting are
   computed into textures at load. site.js publishes scroll progress and the pointer on window.__ww, which this reads. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const html = document.documentElement, ww = window.__ww, canvas = document.getElementById('scene');

/* The carving arithmetic lives in one string so the same code runs inline for the first (fast) build and in a Worker for
   the full-resolution one, which would otherwise freeze the opening for most of a second. No DOM, no THREE in here. */
const MATH_SRC = `
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise2 = (seed, g) => {
  const r = rng(seed), grid = Float32Array.from({ length: g * g }, r), sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x * g, gy = y * g, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0);
    const at = (i, j) => grid[(((j % g) + g) % g) * g + (((i % g) + g) % g)];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
};
const boxBlur = (src, w, h, r) => {
  let a = src, b = new Float32Array(w * h);
  const pass = (from, to, horizontal) => {
    const n = horizontal ? w : h, m = horizontal ? h : w, step = horizontal ? 1 : w, lineStep = horizontal ? w : 1, k = 1 / (2 * r + 1);
    for (let j = 0; j < m; j++) {
      const base = j * lineStep; let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[base + clamp(i, 0, n - 1) * step];
      for (let i = 0; i < n; i++) { to[base + i * step] = acc * k; acc += from[base + Math.min(n - 1, i + r + 1) * step] - from[base + Math.max(0, i - r) * step]; }
    }
  };
  for (let p = 0; p < 3; p++) { pass(a, b, true); const t = a === src ? new Float32Array(w * h) : a; pass(b, t, false); a = t; }
  return a;
};
const edt = (inside, w, h) => {
  const INF = 1e12, out = new Float32Array(w * h), n = Math.max(w, h), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), d = new Float64Array(n);
  const line = len => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s; do { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); } while (s <= z[k] && --k >= 0);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? INF : 0; line(h); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; line(w); for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]); }
  return out;
};
const normals = (hgt, w, h, strength, wrap) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = wrap ? (x - 1 + w) % w : Math.max(0, x - 1), xr = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
    const yu = wrap ? (y - 1 + h) % h : Math.max(0, y - 1), yd = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
    let nx = -(hgt[y * w + xr] - hgt[y * w + xl]) * .5 * strength, ny = (hgt[yd * w + x] - hgt[yu * w + x]) * .5 * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz), k = (y * w + x) * 4;
    d[k] = (nx / l * .5 + .5) * 255; d[k + 1] = (ny / l * .5 + .5) * 255; d[k + 2] = (nz / l * .5 + .5) * 255; d[k + 3] = 255;
  }
  return d;
};
// From the rasterised letters (cutRGBA, goldRGBA) to albedo with baked occlusion, a normal map and the gold inlay mask.
// A patch (at ox, oy inside a GW × GH carving) takes its stone from the same place, so it sits seamlessly in the whole.
function carveMath({ W, H, cut, gold, fs, FW, FH, ox = 0, oy = 0, GW = W, GH = H }) {
  const N = W * H, mask = new Float32Array(N), gm = new Float32Array(N), inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) { mask[i] = cut[i * 4] / 255; gm[i] = gold[i * 4] / 255; inside[i] = mask[i] > .5 ? 1 : 0; }
  // V-cut: depth rises straight from the edge of each stroke to its centre line, so every cut has two crisp planar
  // walls that the raking light separates into a lit side and a shadowed side.
  const dist = edt(inside, W, H), dmax = fs * .052;
  const vcut = new Float32Array(N); for (let i = 0; i < N; i++) vcut[i] = inside[i] ? Math.min(1, (dist[i] - .5 + mask[i]) / dmax) : 0;
  const vs = boxBlur(vcut, W, H, 1);
  const n1 = noise2(11, 7), n2 = noise2(5, 40), r = rng(77);
  const hgt = new Float32Array(N), alb = new Uint8ClampedArray(N * 4), goldA = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, u = (x + ox) / GW, v = (y + oy) / GH, mott = n1(u * FW / 4, v * FH / 4), grain = n2(u * FW / 2, v * FH / 2);
    const depth = clamp(vs[i]);
    hgt[i] = 1 - depth + (grain - .5) * .05 + (mott - .5) * .03 + (r() - .5) * .012;
    const ao = .34 + .66 * Math.pow(clamp(1 - depth), 1.3), k = (.86 + .24 * mott) * ao, j = i * 4;
    alb[j] = 176 * k; alb[j + 1] = 166 * k; alb[j + 2] = 151 * k; alb[j + 3] = 255;
    const ga = clamp(gm[i] * 1.15) * smooth(0, .22, depth) * 255; goldA[j] = goldA[j + 1] = goldA[j + 2] = ga; goldA[j + 3] = 255;
  }
  return { W, H, ox, oy, GW, GH, alb, nrm: normals(hgt, W, H, dmax * 1.25, false), gold: goldA };
}
// Ashlar masonry: 1.1-unit courses of 2.2-unit blocks, staggered, over a 4.4-unit tile.
function masonry(size, seed, base) {
  const T = 4.4, hgt = new Float32Array(size * size), alb = new Uint8ClampedArray(size * size * 4), n1 = noise2(seed, 6), n2 = noise2(seed + 9, 24), n3 = noise2(seed + 13, 10), r = rng(seed + 3);
  const tint = Float32Array.from({ length: 64 }, () => .9 + r() * .2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * T, v = y / size * T, course = Math.floor(v / 1.1), cv = v - course * 1.1, off = course % 2 ? 1.1 : 0;
    const along = (u + off) % 2.2, block = (course * 7 + Math.floor(((u + off) % T) / 2.2)) % 64;   // wrapped, so a block that crosses the tile seam keeps one tint
    const d = Math.min(cv, 1.1 - cv, along, 2.2 - along);
    const edge = smooth(.006, .028, d), grain = n2(x / size, y / size), mott = n1(x / size, y / size);
    // claw-chisel tooling: fine strokes at each block's own angle, their phase wandered by the grain so they never line up
    // into a printed hatch, and only in patches of the face (raking daylight would otherwise show a regular pattern)
    const ang = tint[(block + 17) % 64] * 9.4, patch = smooth(.45, .8, n3(x / size, y / size));
    const tool = Math.sin((along * Math.cos(ang) + cv * Math.sin(ang)) * 110 + grain * 14 + block) * patch;
    const tilt = (tint[(block + 31) % 64] - 1) * (along - 1.1) * .25;   // each block's face sits at its own slight angle
    const hv = edge * .9 + grain * .05 + mott * .04 + tool * .005 + tilt * edge, i = y * size + x; hgt[i] = hv;
    const ao = .8 + .2 * edge, k = tint[block] * (.84 + .26 * mott + .012 * tool) * ao, j = i * 4;
    alb[j] = base[0] * k; alb[j + 1] = base[1] * k; alb[j + 2] = base[2] * k; alb[j + 3] = 255;
  }
  return { alb, nrm: normals(hgt, size, size, size * .02, true) };
}
// Floor: 2-unit slabs, each with its own polish, over a 4-unit tile.
function slabs(size, seed) {
  const T = 4, hgt = new Float32Array(size * size), alb = new Uint8ClampedArray(size * size * 4), rough = new Uint8ClampedArray(size * size * 4), n1 = noise2(seed, 8), r = rng(seed);
  const pol = Float32Array.from({ length: 4 }, () => .22 + r() * .2), tone = Float32Array.from({ length: 4 }, () => .85 + r() * .3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * T, v = y / size * T, su = u % 2, sv = v % 2, s = Math.floor(u / 2) + 2 * Math.floor(v / 2);
    const d = Math.min(su, 2 - su, sv, 2 - sv), edge = smooth(.008, .03, d), m = n1(x / size, y / size), i = y * size + x, j = i * 4;
    hgt[i] = edge; const k = tone[s] * (.8 + .4 * m) * (.45 + .55 * edge);
    alb[j] = 44 * k; alb[j + 1] = 39 * k; alb[j + 2] = 33 * k; alb[j + 3] = 255;
    const g = lerp(.95, pol[s] + m * .12, edge) * 255; rough[j] = rough[j + 1] = rough[j + 2] = g; rough[j + 3] = 255;
  }
  return { alb, rough, nrm: normals(hgt, size, size, size * .01, true) };
}
// Column fluting: 20 flutes around the shaft.
function flutes() {
  const w = 640, h = 4, hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = (x / w * 20) % 1; hgt[y * w + x] = Math.sqrt(Math.max(0, 1 - Math.pow((f - .5) * 2.1, 2))); }
  return normals(hgt, w, h, 9, true);
}
// Honed-stone grain: a tileable micro-relief laid over the carving so the stone keeps its tooth when the camera is close.
function grainNormal(size, seed) {
  const n = noise2(seed, 48), n2 = noise2(seed + 5, 160), hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = n(x / size, y / size) * .7 + n2(x / size, y / size) * .3;
  return normals(hgt, size, size, size * .05, true);
}
// Everything the hall's surfaces need, in one call (run in the Worker so the first frame never waits for it).
function surfaces({ S, G }) {
  const wall = masonry(S, 3, [150, 141, 128]), floor = slabs(S, 21);
  return { S, G, wallAlb: wall.alb, wallNrm: wall.nrm, floorAlb: floor.alb, floorRough: floor.rough, floorNrm: floor.nrm, flute: flutes(), grain: grainNormal(G, 31) };
}
`;
if (ww && canvas && html.classList.contains('stage')) main().catch(err => { console.error(err); html.classList.add('scene-failed'); });

async function main() {
  const T0 = performance.now(), marks = {}; const mark = k => { marks[k] = Math.round(performance.now() - T0); };
  /* ---------- Helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const { carveMath, surfaces } = new Function(MATH_SRC + '; return { carveMath, surfaces };')();
  const dataTex = (data, w, h, srgb, repeat) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = true; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = maxAniso; t.needsUpdate = true; return t;
  };

  /* ---------- Renderer ---------- */
  const phone = () => Math.min(innerWidth, innerHeight) < 600 || matchMedia('(hover: none)').matches;
  const LOW = phone();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const goldEnv = pmrem.fromScene(new RoomEnvironment(), .04).texture;   // reflections for the gold only (scene.environment would light the stone too)
  const fog = new THREE.FogExp2(0x070605, .05); scene.fog = fog;
  scene.background = new THREE.Color(0x070605);
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .05, 400);

  /* ---------- Off the main thread: the hall's surfaces now, the full carving after the opening ---------- */
  const worker = (() => { try { return new Worker(URL.createObjectURL(new Blob([MATH_SRC + `
onmessage = e => {
  const { id, kind, data } = e.data;
  if (kind === 'surfaces') { const r = surfaces(data); postMessage({ id, r }, [r.wallAlb, r.wallNrm, r.floorAlb, r.floorRough, r.floorNrm, r.flute, r.grain].map(a => a.buffer)); }
  else { const r = data.map(carveMath); postMessage({ id, r }, r.flatMap(x => [x.alb.buffer, x.nrm.buffer, x.gold.buffer])); }
};`], { type: 'text/javascript' }))); } catch (e) { return null; } })();
  const waiting = new Map(); let asked = 0;
  if (worker) worker.onmessage = e => { const done = waiting.get(e.data.id); waiting.delete(e.data.id); if (done) done(e.data.r); };
  const ask = (kind, data, transfer) => worker
    ? new Promise(res => { const id = ++asked; waiting.set(id, res); worker.postMessage({ id, kind, data }, transfer || []); })
    : new Promise(res => setTimeout(() => res(kind === 'surfaces' ? surfaces(data) : data.map(carveMath)), 0));   // no Worker: inline, after a frame
  const S = LOW ? 256 : 512, G = LOW ? 128 : 256;
  const surfacesReady = ask('surfaces', { S, G });

  /* ---------- Fonts first: the carving is drawn with the page's own Garamond ---------- */
  mark('renderer');
  const fontsReady = Promise.race([document.fonts.load('500 120px "EB Garamond"', 'ΕΝΑΡΧΗΛΟΓΟΣΚΑΙΠΘ'), new Promise(r => setTimeout(r, 2500))]);
  try { await fontsReady; } catch (e) { /* draw with the fallback serif */ }
  mark('fonts');


  // The inscription: carved relief, ambient occlusion in the cuts, and a separate gold mask for each ΛΟΓΟΣ.
  const LAYOUTS = {
    wide: { lines: ['ΕΝ·ΑΡΧΗ·ΗΝ·Ο·ΛΟΓΟΣ', 'ΚΑΙ·Ο·ΛΟΓΟΣ·ΗΝ·ΠΡΟΣ', 'ΤΟΝ·ΘΕΟΝ·ΚΑΙ·ΘΕΟΣ', 'ΗΝ·Ο·ΛΟΓΟΣ'], FW: 12.4, FH: 3.9, cy: 8.95 },
    tall: { lines: ['ΕΝ·ΑΡΧΗ·ΗΝ', 'Ο·ΛΟΓΟΣ·ΚΑΙ', 'Ο·ΛΟΓΟΣ·ΗΝ', 'ΠΡΟΣ·ΤΟΝ·ΘΕΟΝ', 'ΚΑΙ·ΘΕΟΣ·ΗΝ', 'Ο·ΛΟΓΟΣ'], FW: 5.8, FH: 6.6, cy: 10.25 },
  };
  // Rasterise the lettering (needs the page's fonts, so it stays on the main thread) and record where each gold word sits.
  // Each ΛΟΓΟΣ also gets a patch the size of the word with WORD cut and gilded where the Greek was, for the torch to reveal.
  const raster = (L, res) => {
    const W = res, H = Math.round(res * L.FH / L.FW);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.strokeStyle = '#fff'; return x; };
    const cut = mk(W, H), gold = mk(W, H), n = L.lines.length;
    let fs = H * .8 / n / 1.2;
    const font = s => `500 ${s}px "EB Garamond", Garamond, Georgia, serif`;
    const widthOf = (line, s) => { cut.font = font(s); const tr = s * .16, gap = s * .46; return line.split('·').reduce((a, wd, i) => a + [...wd].reduce((b, ch) => b + cut.measureText(ch).width, 0) + tr * (wd.length - 1) + (i ? gap : 0), 0); };
    const widest = Math.max(...L.lines.map(l => widthOf(l, fs)));
    if (widest > W * .86) fs *= W * .86 / widest;
    cut.font = gold.font = font(fs);
    const capH = cut.measureText('Λ').actualBoundingBoxAscent || fs * .66, lh = fs * 1.2, tr = fs * .16, gap = fs * .46, glosses = [], logos = [];
    L.lines.forEach((line, li) => {
      const base = H / 2 + (li - (n - 1) / 2) * lh + capH / 2;
      let x = (W - widthOf(line, fs)) / 2;
      line.split('·').forEach((wd, wi) => {
        if (wi) { const cx = x + gap / 2; cut.beginPath(); cut.arc(cx, base - capH * .5, fs * .05, 0, Math.PI * 2); cut.fill(); x += gap; }   // interpunct, as on Roman-era stones
        const isLogos = wd === 'ΛΟΓΟΣ', x0 = x;
        [...wd].forEach(ch => { cut.fillText(ch, x, base); if (isLogos) gold.fillText(ch, x, base); x += cut.measureText(ch).width + tr; });
        x -= tr;
        if (isLogos) { glosses.push({ x: ((x0 + x) / 2 / W - .5) * L.FW, y: L.cy + (.5 - (base - capH * .5) / H) * L.FH, w: (x - x0) / W * L.FW, h: capH / H * L.FH }); logos.push({ x0, x1: x, base }); }
      });
    });
    cut.lineWidth = fs * .045; const ins = fs * .42; cut.strokeRect(ins, ins, W - 2 * ins, H - 2 * ins);   // an incised border line inside the tablet
    // The WORD patches: the same font, size and tracking, centred where each ΛΟΓΟΣ is; everything else in the patch is bare stone.
    const spell = (x, word, left, base) => [...word].reduce((cx, ch) => { x.fillText(ch, cx, base); return cx + x.measureText(ch).width + tr; }, left);
    const ew = [...'WORD'].reduce((a, ch) => a + cut.measureText(ch).width, 0) + tr * 3, pad = Math.ceil(fs * .2);
    const pw = Math.ceil(Math.max(ew, ...logos.map(b => b.x1 - b.x0)) + 2 * pad), ph = Math.ceil(capH + 2 * pad);
    const patches = logos.map(b => {
      const ox = Math.round((b.x0 + b.x1 - pw) / 2), oy = Math.round(b.base - capH - pad), pc = mk(pw, ph), pg = mk(pw, ph), left = (b.x0 + b.x1 - ew) / 2 - ox;
      pc.font = pg.font = font(fs); spell(pc, 'WORD', left, b.base - oy); spell(pg, 'WORD', left, b.base - oy);
      return { W: pw, H: ph, ox, oy, GW: W, GH: H, fs, FW: L.FW, FH: L.FH, cut: pc.getImageData(0, 0, pw, ph).data, gold: pg.getImageData(0, 0, pw, ph).data };
    });
    return { W, H, fs, cut: cut.getImageData(0, 0, W, H).data, gold: gold.getImageData(0, 0, W, H).data, glosses, patches };
  };
  const carveTextures = r => ({ alb: dataTex(r.alb, r.W, r.H, true), nrm: dataTex(r.nrm, r.W, r.H, false), gold: dataTex(r.gold, r.W, r.H, false) });
  // The three WORD patches share one set of textures, stacked bottom-up in patch order (the textures are flipped on upload).
  const atlas = ps => {
    const n = ps.length, sz = ps[0].W * ps[0].H * 4, out = { W: ps[0].W, H: ps[0].H * n, alb: new Uint8ClampedArray(sz * n), nrm: new Uint8ClampedArray(sz * n), gold: new Uint8ClampedArray(sz * n) };
    ps.forEach((q, i) => { const o = (n - 1 - i) * sz; out.alb.set(q.alb, o); out.nrm.set(q.nrm, o); out.gold.set(q.gold, o); });
    return out;
  };

  /* ---------- Materials ---------- */
  const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]), FLAT = () => px(128, 128, 255);
  const wallRep = [1 / 4.4, 1 / 4.4], sideRep = [47 / 4.4, 8 / 4.4], fRep = [40 / 4, 62 / 4];
  const wallOffset = new THREE.Vector2();   // set per layout so a course joint meets the tablet frame's foot (see buildTablet)
  const wallMat = new THREE.MeshStandardMaterial({ map: dataTex(px(135, 127, 115), 1, 1, true, wallRep), normalMap: dataTex(FLAT(), 1, 1, false, wallRep), normalScale: new THREE.Vector2(1.2, 1.2), roughness: .92, metalness: 0, envMapIntensity: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ map: dataTex(px(135, 127, 115), 1, 1, true, sideRep), normalMap: dataTex(FLAT(), 1, 1, false, sideRep), roughness: .92, envMapIntensity: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ map: dataTex(px(36, 32, 27), 1, 1, true, fRep), roughnessMap: dataTex(px(120, 120, 120), 1, 1, false, fRep), normalMap: dataTex(FLAT(), 1, 1, false, fRep), roughness: 1, metalness: 0, envMapIntensity: 0 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb4aa9a, roughness: .86, metalness: 0, envMapIntensity: 0 });
  const columnMat = new THREE.MeshStandardMaterial({ color: 0xc4baaa, roughness: .8, normalMap: dataTex(FLAT(), 1, 1, false, [1, 1]), normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: .95, envMapIntensity: 0 });
  const dayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .48, .45), fog: false });   // the daylight beyond the far door
  const doorGlowTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 28, 4, 32, 60, 96); g.addColorStop(0, '#ffffff'); g.addColorStop(.4, '#b4b4b4'); g.addColorStop(1, '#585858'); x.fillStyle = g; x.fillRect(0, 0, 64, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; })();
  const doorMat = new THREE.MeshBasicMaterial({ map: doorGlowTex, color: new THREE.Color(.5, .48, .45), fog: false });   // falls off from the crown, so the door reads as light
  const grainU = { value: dataTex(FLAT(), 1, 1, false, [1, 1]) };
  const panelMat = new THREE.MeshStandardMaterial({ roughness: .88, metalness: 0, envMapIntensity: 0 });
  const grainRepeat = new THREE.Vector2(26, 26);
  // The torch's lens: while its light is on a gilded ΛΟΓΟΣ, that word gives way to the WORD patch cut in its place, written in
  // from the left (wordW is how far along each word the English has reached). A letter is Greek or English, never both at rest.
  // The stone and the gold read the same uniforms, so relief, shading and gilding change together.
  const lens = { patchAlb: { value: null }, patchNrm: { value: null }, patchGold: { value: null }, rects: { value: [0, 1, 2].map(() => new THREE.Vector4(-2, -2, -1, -1)) }, wordW: { value: [0, 0, 0] } };
  const LENS_DECL = 'uniform sampler2D patchAlb, patchNrm, patchGold; uniform vec4 rects[3]; uniform float wordW[3];\n';
  const LENS_AT = `float lensW = 0.0; vec2 patchUv = vec2(0.0);
    { vec2 uv = vNormalMapUv;
      for (int i = 0; i < 3; i++) { vec2 st = (uv - rects[i].xy) / (rects[i].zw - rects[i].xy);
        if (wordW[i] > 0.0 && st.x >= 0.0 && st.x <= 1.0 && st.y >= 0.0 && st.y <= 1.0) {
          // feathered at the patch border, inside the padding, so its edge (and any bleed between atlas rows) never shows as a seam
          float rim = smoothstep(0.0, 0.035, st.x) * smoothstep(0.0, 0.035, 1.0 - st.x) * smoothstep(0.0, 0.12, st.y) * smoothstep(0.0, 0.12, 1.0 - st.y);
          lensW = clamp((wordW[i] * 1.06 - st.x) / 0.06, 0.0, 1.0) * rim; patchUv = vec2(st.x, (float(i) + st.y) / 3.0); } } }
    `;
  const LENS_NORMAL = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0; if ( lensW > 0.0 ) mapN = mix( mapN, texture2D( patchNrm, patchUv ).xyz * 2.0 - 1.0, lensW ); mapN.xy *= normalScale;';
  panelMat.onBeforeCompile = sh => {   // a tiled grain normal under the carving's own normal, so close-ups read as stone, not as a picture of stone
    Object.assign(sh.uniforms, lens); sh.uniforms.grainMap = grainU; sh.uniforms.grainRepeat = { value: grainRepeat };
    sh.fragmentShader = LENS_DECL + 'uniform sampler2D grainMap; uniform vec2 grainRepeat;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `${LENS_AT}#include <map_fragment>
       if ( lensW > 0.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, diffuse * texture2D( patchAlb, patchUv ).rgb, lensW );`)
      .replace('#include <normal_fragment_maps>',
      `${LENS_NORMAL}
       vec3 grainN = texture2D( grainMap, vNormalMapUv * grainRepeat ).xyz * 2.0 - 1.0;
       mapN = normalize( vec3( mapN.xy + grainN.xy * 0.42, mapN.z ) );
       normal = normalize( tbn * mapN );`);
  };
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd9b25a, metalness: 1, roughness: .34, envMap: goldEnv, envMapIntensity: .17, normalScale: new THREE.Vector2(.55, .55), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  goldMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, lens);
    sh.fragmentShader = LENS_DECL + sh.fragmentShader
      .replace('#include <map_fragment>', `${LENS_AT}#include <map_fragment>`)
      .replace('#include <alphamap_fragment>', 'float gilt = texture2D( alphaMap, vAlphaMapUv ).g; if ( lensW > 0.0 ) gilt = mix( gilt, texture2D( patchGold, patchUv ).g, lensW ); diffuseColor.a *= gilt;')
      .replace('#include <normal_fragment_maps>', `${LENS_NORMAL} normal = normalize( tbn * mapN );`);
  };
  // The real surfaces, when the Worker has them: swapped map for map, so no shader recompiles.
  const swap = (m, key, t) => { const old = m[key]; m[key] = t; if (old) old.dispose(); };
  surfacesReady.then(r => {
    swap(wallMat, 'map', dataTex(r.wallAlb, r.S, r.S, true, wallRep)); swap(wallMat, 'normalMap', dataTex(r.wallNrm, r.S, r.S, false, wallRep));
    wallMat.map.offset.copy(wallOffset); wallMat.normalMap.offset.copy(wallOffset);
    const side = wallMat.map.clone(), sideN = wallMat.normalMap.clone(); side.repeat.set(...sideRep); sideN.repeat.set(...sideRep); side.offset.set(0, 0); sideN.offset.set(0, 0);
    swap(sideMat, 'map', side); swap(sideMat, 'normalMap', sideN);
    swap(floorMat, 'map', dataTex(r.floorAlb, r.S, r.S, true, fRep)); swap(floorMat, 'roughnessMap', dataTex(r.floorRough, r.S, r.S, false, fRep)); swap(floorMat, 'normalMap', dataTex(r.floorNrm, r.S, r.S, false, fRep));
    swap(columnMat, 'normalMap', dataTex(r.flute, 640, 4, false, [1, 1]));
    const old = grainU.value; grainU.value = dataTex(r.grain, r.G, r.G, false, [1, 1]); old.dispose();
    mark('surfaces');
  });
  mark('materials');

  /* ---------- Geometry ---------- */
  const archShape = (outer, rx, spring, bottom) => {
    const s = new THREE.Shape(); s.moveTo(outer[0], outer[1]); s.lineTo(outer[2], outer[1]); s.lineTo(outer[2], outer[3]); s.lineTo(outer[0], outer[3]); s.closePath();
    const h = new THREE.Path(); h.moveTo(-rx, bottom); h.lineTo(-rx, spring); h.absarc(0, spring, rx, Math.PI, 0, true); h.lineTo(rx, bottom); h.closePath();
    s.holes.push(h); return s;
  };
  const mesh = (g, m, opts = {}) => { const o = new THREE.Mesh(g, m); o.castShadow = !!opts.cast; o.receiveShadow = opts.receive !== false; if (opts.pos) o.position.set(...opts.pos); if (opts.rot) o.rotation.set(...opts.rot); (opts.parent || scene).add(o); return o; };
  const RX = 2.6, SPRING = 3.6;
  mesh(new THREE.ExtrudeGeometry(archShape([-18, -.5, 18, 16], RX, SPRING, -.3), { depth: 1.4, bevelEnabled: false, curveSegments: 48 }), wallMat, { pos: [0, 0, -1.4] });
  // The archivolt: a moulding up one jamb, over the arch and down the other.
  class Archivolt extends THREE.Curve {
    constructor(r, spring, z) { super(); this.r = r; this.sp = spring; this.z = z; this.T = spring * 2 + Math.PI * r; }
    getPoint(t, out = new THREE.Vector3()) {
      let d = t * this.T; const { r, sp, z } = this;
      if (d < sp) return out.set(-r, d, z); d -= sp;
      if (d < Math.PI * r) { const a = Math.PI - d / r; return out.set(Math.cos(a) * r, sp + Math.sin(a) * r, z); } d -= Math.PI * r;
      return out.set(r, sp - d, z);
    }
  }
  mesh(new THREE.TubeGeometry(new Archivolt(RX + .2, SPRING, .02), 160, .13, 12, false), stoneMat, { cast: true });
  // The keystone: a shallow wedge that tucks up under the tablet's frame, so no sliver of wall shows between them.
  const keystone = (() => {
    const s = new THREE.Shape(); s.moveTo(-.34, 0); s.lineTo(.34, 0); s.lineTo(.46, 1.0); s.lineTo(-.46, 1.0); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: false });
  })();
  mesh(keystone, stoneMat, { pos: [0, SPRING + RX - .14, .02], cast: true });

  // The tablet with the inscription, framed, rebuilt when the screen turns between wide and tall.
  const tablet = new THREE.Group(); scene.add(tablet);
  let layoutKey = '', L = LAYOUTS.wide, logosBoxes = [], carveJob = 0;
  const rectOf = q => new THREE.Vector4(q.ox / q.GW, 1 - (q.oy + q.H) / q.GH, (q.ox + q.W) / q.GW, 1 - q.oy / q.GH);   // a patch's place on the tablet, in its uv
  const applyCarve = (rs, staged) => {   // swap the carving in, then its WORD patches; staged spreads the GPU uploads over four frames
    const [r, ...ps] = rs, tx = carveTextures(r), old = [panelMat.map, panelMat.normalMap, goldMat.alphaMap, lens.patchAlb.value, lens.patchNrm.value, lens.patchGold.value];
    const steps = [() => { panelMat.map = tx.alb; panelMat.needsUpdate = true; }, () => { panelMat.normalMap = tx.nrm; goldMat.normalMap = tx.nrm; panelMat.needsUpdate = goldMat.needsUpdate = true; }, () => { goldMat.alphaMap = tx.gold; goldMat.needsUpdate = true; },
      () => { const pt = carveTextures(atlas(ps)); lens.patchAlb.value = pt.alb; lens.patchNrm.value = pt.nrm; lens.patchGold.value = pt.gold; ps.forEach((q, i) => lens.rects.value[i].copy(rectOf(q))); old.forEach(t => t && t.dispose()); }];
    if (!staged) { steps.forEach(f => f()); return; }
    let i = 0; const next = () => { steps[i++](); if (i < steps.length) requestAnimationFrame(next); }; requestAnimationFrame(next);
  };
  const jobsOf = r => [{ W: r.W, H: r.H, cut: r.cut, gold: r.gold, fs: r.fs, FW: L.FW, FH: L.FH }, ...r.patches];   // the whole carving, then each WORD patch
  const upgradeCarve = () => {   // the full-resolution carving, computed off the main thread and swapped in when ready
    const job = ++carveJob, res = LOW ? 2048 : (layoutKey === 'wide' ? 4096 : 3072), jobs = jobsOf(raster(L, res));
    ask('carve', jobs, jobs.flatMap(j => [j.cut.buffer, j.gold.buffer])).then(r => { if (job !== carveJob) return; applyCarve(r, true); mark('carve-hi'); });
  };
  const buildTablet = () => {
    const key = innerWidth / innerHeight < .95 ? 'tall' : 'wide'; if (key === layoutKey) return; layoutKey = key; L = LAYOUTS[key]; carveJob++;
    tablet.children.slice().forEach(c => { tablet.remove(c); c.geometry.dispose(); });
    const r = raster(L, LOW ? 1280 : (key === 'wide' ? 2048 : 1536));   // a quick first carving; the full one follows off-thread
    logosBoxes = r.glosses;
    applyCarve(jobsOf(r).map(carveMath), false);
    panelMat.normalScale = new THREE.Vector2(1, 1); grainRepeat.set(26, 26 * L.FH / L.FW); panelMat.needsUpdate = true;
    const add = (g, m, p, cast) => { const o = new THREE.Mesh(g, m); o.position.set(...p); o.castShadow = !!cast; o.receiveShadow = true; tablet.add(o); };
    add(new THREE.PlaneGeometry(L.FW, L.FH), panelMat, [0, L.cy, .012]);
    add(new THREE.PlaneGeometry(L.FW, L.FH), goldMat, [0, L.cy, .016]);
    const fw = .22, fd = .14;
    // Courses are 1.1 tall and meet at multiples of 1.1; shift them so one joint runs exactly along the frame's foot. Otherwise a thin
    // sliver of a course shows under the frame, and in the torch's raking light it reads as a seam.
    const foot = L.cy - L.FH / 2 - fw; wallOffset.set(0, -(((foot % 1.1) + 1.1) % 1.1) / 4.4);
    [wallMat.map, wallMat.normalMap].forEach(t => t && t.offset.copy(wallOffset));
    // The frame is shallow and flush on the wall, with the torch nearly grazing it: its shadow would land detached and frayed
    // along the shadow map's texels (a bright seam and a hatched band under the tablet), so it casts none.
    add(new THREE.BoxGeometry(L.FW + 2 * fw, fw, fd), stoneMat, [0, L.cy + L.FH / 2 + fw / 2, fd / 2], false);
    add(new THREE.BoxGeometry(L.FW + 2 * fw, fw, fd), stoneMat, [0, L.cy - L.FH / 2 - fw / 2, fd / 2], false);
    add(new THREE.BoxGeometry(fw, L.FH, fd), stoneMat, [-L.FW / 2 - fw / 2, L.cy, fd / 2], false);
    add(new THREE.BoxGeometry(fw, L.FH, fd), stoneMat, [L.FW / 2 + fw / 2, L.cy, fd / 2], false);
    keys = makeKeys();
  };

  // The hall runs from the entrance wall to the far door and no further: beyond the door there is only daylight.
  // Tall screens see a narrower hall, so its columns stand inside the frame instead of beyond its edges.
  const hall = new THREE.Group(); scene.add(hall);
  let hallKey = '';
  const buildHall = () => {
    const tall = innerWidth / innerHeight < .95, key = tall ? 'tall' : 'wide'; if (key === hallKey) return; hallKey = key;
    hall.children.slice().forEach(c => { hall.remove(c); c.geometry.dispose(); });
    const CX = tall ? 2.3 : 3.6, HW = tall ? 4.7 : 7.2, CW = tall ? 10 : 16, DW = tall ? 5.3 : 8, DR = tall ? 1.9 : 2.4;
    sconces.forEach(sc => { sc.l.position.x = sc.side * (HW - .35); sc.s.position.x = sc.l.position.x; sc.s.scale.setScalar(tall ? .34 : .6); });   // the wide hall's flames throw further, so they show bigger
    const P = { parent: hall };
    mesh(new THREE.PlaneGeometry(40, 62), floorMat, { ...P, pos: [0, 0, -17], rot: [-Math.PI / 2, 0, 0] });
    mesh(new THREE.PlaneGeometry(CW, 47), ceilMat, { ...P, pos: [0, 6.9, -23.5], rot: [Math.PI / 2, 0, 0] });
    [-1, 1].forEach(s => mesh(new THREE.PlaneGeometry(47, 8), sideMat, { ...P, pos: [s * HW, 3.4, -23.5], rot: [0, -s * Math.PI / 2, 0] }));
    const COLS = []; for (let z = -4.5; z >= -41; z -= 4.5) COLS.push([-CX, z], [CX, z]);
    const inst = (g, m, y) => {
      const im = new THREE.InstancedMesh(g, m, COLS.length), o = new THREE.Object3D();
      COLS.forEach(([x, z], i) => { o.position.set(x, y, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.castShadow = true; im.receiveShadow = true; hall.add(im);
    };
    inst(new THREE.BoxGeometry(1.25, .22, 1.25), stoneMat, .11);
    inst(new THREE.CylinderGeometry(.58, .64, .3, 40), stoneMat, .37);
    inst(new THREE.CylinderGeometry(.4, .45, 5.4, 48, 1), columnMat, .52 + 2.7);
    inst(new THREE.CylinderGeometry(.64, .42, .42, 40), stoneMat, 6.13);
    inst(new THREE.BoxGeometry(1.35, .2, 1.35), stoneMat, 6.44);
    // architraves: they start behind the entrance wall (its back face is at z −1.4); ending flush with its front face, their ends
    // fought it for depth and showed through as bright blocks under the tablet
    [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(.95, .36, 44.6), stoneMat, { ...P, pos: [s * CX, 6.72, -23.7], cast: true }));
    mesh(new THREE.ExtrudeGeometry(archShape([-DW, -.5, DW, 8.2], DR, 3.6, -.3), { depth: 1, bevelEnabled: false, curveSegments: 48 }), wallMat, { ...P, pos: [0, 0, -47] });   // the far door
    mesh(new THREE.PlaneGeometry(DR * 2 + .6, 7.4), doorMat, { ...P, pos: [0, 3.2, -47.6], receive: false });   // the light in the doorway, brightest at the crown
    mesh(new THREE.PlaneGeometry(500, 260), dayMat, { ...P, pos: [0, 0, -90], receive: false });
  };

  /* ---------- Lights ---------- */
  const torch = new THREE.PointLight(0xff9a50, 0, 0, 2);
  torch.castShadow = !LOW; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = .08; torch.shadow.camera.far = 30; torch.shadow.bias = -.0006; torch.shadow.normalBias = .06;
  scene.add(torch);
  const moon = new THREE.AmbientLight(0x3a4458, .1);
  const hemi = new THREE.HemisphereLight(0xfff2de, 0x2a241c, 0);
  const sun = new THREE.DirectionalLight(0xfff4e0, 0); sun.position.set(0, 12, -80); sun.target.position.set(0, 1, -30);
  scene.add(moon, hemi, sun, sun.target);
  // The flame: a hot core and a halo the bloom pass spreads, plus embers.
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,220,170,.85)'); g.addColorStop(.6, 'rgba(255,140,60,.25)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const spriteMat = (c, o) => new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const halo = new THREE.Sprite(spriteMat(0xff9a4a, .9)), core = new THREE.Sprite(spriteMat(0xfff1d8, 1));
  halo.scale.setScalar(.55); core.scale.setScalar(.16); scene.add(halo, core);
  // Wall sconces down the hall: small flames on the side walls, so the columns read even on a narrow screen where the
  // carried torch alone leaves them beyond the frame. They burn steady, and go out as the daylight takes over.
  const sconces = [-5.5, -14, -23, -32].map((z, i) => {
    const side = i % 2 ? 1 : -1, l = new THREE.PointLight(0xff9a50, 0, 0, 2); l.position.set(side * 3.1, 4.3, z); scene.add(l);
    const s = new THREE.Sprite(spriteMat(0xff9a4a, .6)); s.scale.setScalar(.34); s.position.copy(l.position); scene.add(s);
    return { l, s, phase: i * 1.7, side };
  });
  const EN = ww.rm ? 0 : (LOW ? 36 : 72);
  const ePos = new Float32Array(EN * 3), eCol = new Float32Array(EN * 3), eVel = new Float32Array(EN * 3), eAge = new Float32Array(EN).fill(9), eLife = new Float32Array(EN).fill(1);
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3)); eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: .045, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  embers.frustumCulled = false; scene.add(embers);

  /* ---------- Post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .5, .88);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  if (LOW) composer.setPixelRatio(1);

  /* ---------- The walk: camera stations, keyed to scroll progress (in screens) ---------- */
  let keys = [];
  const makeKeys = () => {
    const aspect = innerWidth / innerHeight, tall = aspect < .95, fov = tall ? 52 : 38; camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(fov / 2)), d0 = Math.max(10, (L.FW * 1.1 / 2) / (t * aspect), (L.FH * 1.9 / 2) / t), y = L.cy;
    const lift = (tall ? .36 : .25) * d0 * t;   // the tablet sits in the upper part of the frame, above the words
    // In the hall the camera walks the nave, standing a little to one side at each stop so the words get the darker side of the
    // frame: Verse View on the left, Word Detail on the right; at What's inside it looks straight down the hall. Tall screens set
    // the words along the foot of the frame, so they keep to the centre line.
    const sx = tall ? 0 : 1;
    return [
      { p: 0, pos: [0, y - lift - .3, d0], look: [0, y - lift, 0] },
      { p: 1.05, pos: [0, y - 1.7, d0 * .56], look: [0, y - .8, 0] },
      { p: 2.0, pos: [0, 2.9, 3.0], look: [0, 2.7, -6] },
      { p: 2.6, pos: [sx * 1.1, 2.45, -6.5], look: [sx * .5, 2.6, -20] },
      { p: 3.95, pos: [-sx * 1.1, 2.45, -14], look: [-sx * .5, 2.6, -28] },
      { p: 5.25, pos: [0, 2.5, -21], look: [0, 2.8, -36] },
      { p: 5.85, pos: [0, 2.6, -25.5], look: [0, 2.9, -38] },
      { p: 7.0, pos: [0, 2.75, -37.5], look: [0, 3.25, -52] },   // the walk ends at the threshold: the far door frames the daylight
    ].map(k => ({ p: k.p, pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look) }));
  };
  const posCurve = () => new THREE.CatmullRomCurve3(keys.map(k => k.pos), false, 'centripetal');
  const lookCurve = () => new THREE.CatmullRomCurve3(keys.map(k => k.look), false, 'centripetal');
  let pc, lc, anchors = [];
  // The camera moves along the path by distance, not by waypoint: between two stops it covers equal distance for equal scroll,
  // so a step that passes through an extra waypoint (the doorway) never surges. site.js eases the scroll itself, once per step.
  const STOP_P = [0, 1.05, 2.6, 3.95, 5.25];
  const pathAnchors = () => {
    const n = keys.length - 1; pc.arcLengthDivisions = 200 * n; const lens = pc.getLengths();
    anchors = keys.map((k, i) => [k.p, lens[i * 200]]).filter(([kp], i) => i === 0 || i === n || STOP_P.includes(kp));
  };
  const station = (p, out, look) => {
    let i = 0; while (i < anchors.length - 2 && p > anchors[i + 1][0]) i++;
    const [pa, la] = anchors[i], [pb, lb] = anchors[i + 1], t = pc.getUtoTmapping(0, lerp(la, lb, clamp((p - pa) / (pb - pa))));
    pc.getPoint(t, out); lc.getPoint(t, look);
  };
  const rebuild = () => { buildHall(); buildTablet(); keys = makeKeys(); pc = posCurve(); lc = lookCurve(); pathAnchors(); };
  mark('geometry'); rebuild(); mark('tablet');

  /* ---------- The KJV line: the light on a gilded word lights the matching "Word" (styles.css reads --g0..2) ---------- */
  const gLast = [-1, -1, -1];

  /* ---------- Frame ---------- */
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), dir = new THREE.Vector3(), tWall = new THREE.Vector3(), tHall = new THREE.Vector3();
  const night = new THREE.Color(0x070605), daylight = new THREE.Color(0xf3efe6);
  const sp = { x: -.7, y: .3 };   // the torch's own (smoothed) aim, in screen units
  const skipIntro = ww.p > .05 || ww.rm;
  let sized = innerWidth + 'x' + innerHeight, start = performance.now(), last = start, rmStation = -1, rmFade = 1, firstFrame = true, afterOpening = false;
  const RM_STOPS = [0, 1.05, 2.6, 3.95, 5.25, 7.0];
  const frame = now => {
    requestAnimationFrame(frame);
    if (document.hidden || !innerWidth || !innerHeight) return;   // hidden, or laid out at zero size: nothing to draw
    if (sized !== innerWidth + 'x' + innerHeight) fit();   // a resize (or a page first laid out at zero size) rebuilds the walk
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (firstFrame) start = last = now;   // the opening is timed from the first frame drawn, so a slow first compile never eats it
    const t = (now - start) / 1000, p = ww.p;
    const tall = camera.aspect < .95;
    // Where the light wants to be: the pointer, the opening sweep, or an idle wander.
    const used = ww.pointer.moved > start, idle = (now - ww.pointer.moved) / 1000;
    let ax, ay;
    if (used && idle < 3.5) { ax = ww.pointer.x; ay = ww.pointer.y; }
    else if (!skipIntro && !used && t < 5.6) { const k = smooth(2.0, 5.4, t); ax = lerp(tall ? -.6 : -.74, tall ? .6 : .74, k); ay = tall ? .46 : .3; }   // after the torch catches, it sweeps the first line
    else {
      // Idle: on the wall the light wanders across the inscription; in the hall it keeps to the side away from the words.
      const tt = t * .9, inHall = smooth(1.6, 2.3, p);
      const side = tall ? 0 : (p < 3.3 ? .52 : p < 4.6 ? -.52 : .55), lift = tall ? .66 : (p < 4.6 ? .1 : .72);
      ax = lerp((tall ? .58 : .62) * Math.sin(tt * .31), side + .12 * Math.sin(tt * .41), inHall);
      ay = lerp(.2 * Math.sin(tt * .53 + 1) + (tall ? .32 : .28), lift + .08 * Math.sin(tt * .57 + 1), inHall);
    }
    const follow = ww.rm ? .2 : .085; sp.x = lerp(sp.x, ax, follow); sp.y = lerp(sp.y, ay, follow);
    // Camera: the station for this scroll position, plus a little parallax toward the light.
    const day = smooth(5.6, 6.9, p);
    let cp = p;
    if (ww.rm) {   // no travel: cut between stations through a dip to dark
      const st = RM_STOPS.reduce((best, s, i, arr) => Math.abs(s - p) < Math.abs(arr[best] - p) ? i : best, 0);
      if (rmStation < 0) rmStation = st;
      if (st !== rmStation) { rmFade = Math.max(0, rmFade - dt * 6); if (rmFade === 0) rmStation = st; }
      else rmFade = Math.min(1, rmFade + dt * 5);
      cp = RM_STOPS[rmStation];
      canvas.style.opacity = rmFade.toFixed(3);
    }
    station(cp, camPos, camLook);
    camera.position.copy(camPos); camera.lookAt(camLook); camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const par = ww.rm ? 0 : (1 - day) * .32 * Math.min(1, camera.aspect);   // less sway on narrow screens
    camera.position.addScaledVector(right, sp.x * par).addScaledVector(up, sp.y * par * .6);
    camera.lookAt(camLook); camera.updateMatrixWorld();
    // The torch: on the wall it is held a hand's length from the stone; in the hall it is carried ahead.
    ndc.set(sp.x, sp.y); ray.setFromCamera(ndc, camera); dir.copy(ray.ray.direction);
    const onWall = 1 - smooth(1.35, 2.25, cp);
    tHall.copy(camera.position).addScaledVector(dir, 2.4).addScaledVector(up, -.15);
    if (onWall > 0 && camera.position.z > 1.6 && dir.z < -.05) { tWall.copy(ray.ray.origin).addScaledVector(dir, (1.15 - ray.ray.origin.z) / dir.z); tHall.lerp(tWall, onWall); }
    const flick = ww.rm ? 1 : .86 + .07 * Math.sin(t * 9.1) + .05 * Math.sin(t * 17.3 + 1.7) + .04 * Math.sin(t * 29.9 + .4) + .03 * (Math.random() - .5);
    // The opening: a moment of only the gilded words in the dark, then the torch catches with a brief flare.
    const lit = skipIntro ? 1 : smooth(1.25, 2.4, t) * (1 + .3 * Math.max(0, 1 - Math.abs(t - 1.75) / .5));
    const ignite = skipIntro ? 0 : Math.max(0, 1 - Math.abs(t - 1.65) / .5);
    const stride = torch.position.distanceTo(tHall);   // how far the flame moved this frame: embers only rise from a held flame, and die once it has gone on
    torch.position.copy(tHall); if (!ww.rm) torch.position.x += Math.sin(t * 13.7) * .012, torch.position.y += Math.sin(t * 11.1) * .015;
    torch.intensity = lerp(6.5, tall ? 20 : 14, 1 - onWall) * flick * lit * (1 - .9 * day);
    halo.position.copy(torch.position); core.position.copy(torch.position);
    const inHallLight = smooth(1.2, 2.0, cp) * (1 - day);
    sconces.forEach(sc => { const f = ww.rm ? 1 : .8 + .12 * Math.sin(t * 7.3 + sc.phase) + .08 * Math.sin(t * 13.1 + sc.phase * 2); sc.l.intensity = (tall ? 7.5 : 14) * f * inHallLight; sc.s.material.opacity = .55 * f * inHallLight; sc.s.visible = inHallLight > .01; });
    const carried = 1 - onWall, reading = html.classList.contains('reading') ? .25 : 1;   // carried down the hall, the flame is close: smaller and softer; over the words it steps back further
    halo.material.opacity = lerp(.8, .4, carried) * reading * lit * (1 - day) * (.9 + .1 * flick); core.material.opacity = lerp(1, .6, carried) * (reading < 1 ? .45 : 1) * lit * (1 - day);
    halo.scale.setScalar((lerp(.5, .2, carried) + .05 * flick) * (reading < 1 ? .5 : 1)); core.scale.setScalar(lerp(.16, .07, carried));
    // Embers rise from the flame.
    for (let i = 0; i < EN; i++) {
      eAge[i] += dt;
      if (eAge[i] < eLife[i] && (ePos[i * 3] - torch.position.x) ** 2 + (ePos[i * 3 + 1] - torch.position.y) ** 2 + (ePos[i * 3 + 2] - torch.position.z) ** 2 > 2.6) eAge[i] = 9;
      if (eAge[i] > eLife[i] && lit > .5 && day < .6 && stride < .05 && reading === 1 && Math.random() < dt * 22) {   // none rise across the words
        eAge[i] = 0; eLife[i] = 1 + Math.random() * 1.6;
        ePos[i * 3] = torch.position.x + (Math.random() - .5) * .08; ePos[i * 3 + 1] = torch.position.y + .04; ePos[i * 3 + 2] = torch.position.z + (Math.random() - .5) * .08;
        eVel[i * 3] = (Math.random() - .5) * .18; eVel[i * 3 + 1] = .3 + Math.random() * .45; eVel[i * 3 + 2] = (Math.random() - .5) * .12;
      }
      const a = eAge[i] / eLife[i], k = a >= 1 ? 0 : Math.pow(1 - a, 1.4) * Math.min(1, eAge[i] / .12);
      ePos[i * 3] += (eVel[i * 3] + Math.sin(t * 3 + i) * .05) * dt; ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt; ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
      eCol[i * 3] = 1 * k; eCol[i * 3 + 1] = .55 * k; eCol[i * 3 + 2] = .22 * k;
    }
    if (EN) { eGeo.attributes.position.needsUpdate = true; eGeo.attributes.color.needsUpdate = true; }
    // The lens follows the light on the wall: where its beam meets the tablet (in the tablet's uv), any gilded word it rests on
    // turns to WORD, written in over about a third of a second, and back again once the light moves on.
    let hu = -9, hv = -9;
    if (onWall * lit > .5 && camera.position.z > 1.6 && dir.z < -.05) { const h = (.016 - ray.ray.origin.z) / dir.z; hu = (ray.ray.origin.x + dir.x * h) / L.FW + .5; hv = (ray.ray.origin.y + dir.y * h - L.cy) / L.FH + .5; }
    const ease = ww.rm ? 1 : Math.min(1, dt * 7), wordW = lens.wordW.value;
    lens.rects.value.forEach((r, i) => {   // on while the light is within the word, or just above or below it
      const on = ((hu - (r.x + r.z) / 2) / ((r.z - r.x) / 2)) ** 2 + ((hv - (r.y + r.w) / 2) / ((r.w - r.y) * .8)) ** 2 < 1 ? 1 : 0;
      wordW[i] = Math.abs(on - wordW[i]) < .004 ? on : wordW[i] + (on - wordW[i]) * ease;
    });
    // Once the KJV line is on screen, the light on a gilded word picks out the matching "Word" in it.
    const kjvOn = smooth(.55, .95, cp);
    for (let i = 0; i < 3; i++) {
      const b = logosBoxes[i], reach = b && onWall > .01 ? smooth(1.9, .55, Math.hypot(torch.position.x - b.x, torch.position.y - b.y)) * onWall * lit : 0, g = Math.round(reach * kjvOn * 1000) / 1000;
      if (g !== gLast[i]) { gLast[i] = g; html.style.setProperty('--g' + i, String(g)); }
    }
    // Night into day.
    moon.intensity = .1 * (1 - day);
    goldMat.envMapIntensity = lerp(skipIntro ? .17 : lerp(.26, .17, smooth(1.2, 3, t)), .7, day);
    hemi.intensity = lerp(0, 1.4, day); sun.intensity = lerp(0, 2.0, day);
    fog.color.copy(night).lerp(daylight, day); fog.density = lerp(.05, .012, day);
    scene.background.copy(fog.color);
    const dawn = smooth(5.6, 6.9, p), glimmer = tall ? .004 : .006 + .005 * smooth(2.4, 4.2, p) * (1 - .8 * smooth(4.4, 4.9, p)), portal = lerp(glimmer, 1.75, dawn);
    // barely a glow at night, held back wherever the words would sit over it (all of the hall on tall screens), full daylight at the end
    dayMat.color.setRGB(portal, portal * lerp(.78, .965, dawn), portal * lerp(.52, .9, dawn));
    const crown = portal * lerp(1, 1.7, dawn); doorMat.color.setRGB(crown, crown * lerp(.78, .965, dawn), crown * lerp(.52, .9, dawn));
    bloom.strength = lerp(.55, .1, day) + ignite * .9;
    composer.render();
    if (firstFrame) { firstFrame = false; html.classList.add('lit'); mark('first-frame'); }
    // Once the opening has played (or was skipped), finish the heavy work the first frame did not need.
    if (!afterOpening && (skipIntro ? t > .4 : t > 6.4)) { afterOpening = true; upgradeCarve(); }
  };

  const fit = () => {   // size everything to the window; called whenever the frame loop sees the window's size change
    sized = innerWidth + 'x' + innerHeight;
    renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth, innerHeight);
    const before = layoutKey; rebuild(); if (layoutKey !== before && afterOpening) upgradeCarve();
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); html.classList.add('scene-failed'); });
  window.__scene = { scene, camera, renderer, torch, sun, hemi, bloom, panelMat, goldMat, lens, marks };   // inspection handle for review tooling
  requestAnimationFrame(frame);
}
