/* WordWell Bible landing page · Dawn and growth (SIZE-252; the night version it replaced is in archive/).
   A stone wall at first light with John 1:1 carved into it in Greek capitals, each λόγος inlaid in gold. The visitor's
   pointer holds the first shaft of sun; every gilded ΛΟΓΟΣ inside the shaft gives way to WORD, cut and gilded in its place.
   Scrolling walks through the arched doorway and down a hall of columns that stays dim and blue while the sun climbs
   outside: shafts come through arched windows in the left-hand wall and slide as you walk, the hall greens around you
   (moss, ferns, ivy on real stems, grass), and the far door opens on full day over a meadow. site.js sets each stop's
   words over it. Everything is generated here (no model or image files): carving relief, masonry, slabs, fluting and the
   plants' textures are computed at load. site.js publishes scroll progress and the pointer on window.__ww, which this reads. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
    // moss: in the joints, and creeping a little onto the faces from below, in patches
    const moss = clamp((1 - smooth(.004, .05, d)) * smooth(.42, .7, n3(x / size + .3, y / size)) + smooth(.62, .85, mott) * (1 - smooth(0, .5, cv)) * .7);
    alb[j] = lerp(base[0] * k, 74 * (.8 + .4 * grain), moss); alb[j + 1] = lerp(base[1] * k, 96 * (.8 + .4 * grain), moss); alb[j + 2] = lerp(base[2] * k, 46, moss); alb[j + 3] = 255;
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
    hgt[i] = edge; const k = tone[s] * (.8 + .4 * m) * (.6 + .4 * edge), green = 1 - smooth(.01, .07, d);
    alb[j] = lerp(150 * k, 70, green); alb[j + 1] = lerp(140 * k, 92, green); alb[j + 2] = lerp(122 * k, 44, green); alb[j + 3] = 255;
    const g = lerp(.95, pol[s] + .3 + m * .12, edge) * 255; rough[j] = rough[j + 1] = rough[j + 2] = g; rough[j + 3] = 255;
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
  const wall = masonry(S, 3, [176, 166, 150]), floor = slabs(S, 21);
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
  // Render scale: start below the screen's full pixel ratio, then let the governor in the frame loop step it up while there
  // is headroom and back down when frames run long (the words over the scene are HTML, so they stay sharp regardless).
  const PR_MAX = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2), PR_MIN = Math.min(PR_MAX, LOW ? .8 : 1);
  let pr = Math.min(PR_MAX, LOW ? 1.2 : 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;   // phones too: without shadows the walls cannot hold the sun out (maps redraw only when their light changes)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const goldEnv = pmrem.fromScene(new RoomEnvironment(), .04).texture;   // reflections for the gold only (scene.environment would light the stone too)
  const fog = new THREE.FogExp2(0x1b222d, .03); scene.fog = fog;
  scene.background = new THREE.Color(0x1b222d);
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
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6f675b, roughness: .95, envMapIntensity: 0 });
  const daylit = [];   // [material, its full-day colour]: everything beyond the far door, dimmed together while the door is far off
  const skyTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5f90b0'); g.addColorStop(.5, '#93b6c9'); g.addColorStop(.7, '#c3d5d9'); g.addColorStop(.84, '#ecebdf'); g.addColorStop(.9, '#f8f1e0'); g.addColorStop(1, '#e9dfc4'); x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(1.08, 1.08, 1.08), fog: false });
  const skyDay = { value: 0 };   // overhead (seen through the roof) the sky stays a dim dawn blue until the day comes on
  skyMat.onBeforeCompile = sh => { sh.uniforms.uDay = skyDay; sh.fragmentShader = 'uniform float uDay;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( .26, .32, .46 ), smoothstep( .3, .5, vMapUv.y ) * ( 1. - uDay ) );'); };
  const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.42, .5, .25), fog: false });
  daylit.push([skyMat, skyMat.color.clone()], [groundMat, groundMat.color.clone()]);
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

  /* ---------- Growth: plants rooted in moss, growing as you walk ---------- */
  // Every plant starts from somewhere a plant could take hold: moss and soil in the corners where the floor meets a wall or a
  // column's plinth, and the tops of beams. Vines draw out along real stems and put out leaves as they go; each piece is born
  // at its own point on the walk (aBirth), so the hall greens as the day comes on.
  const grow = { value: 0 };
  const growify = m => { m.onBeforeCompile = sh => { sh.uniforms.uGrow = grow; sh.vertexShader = 'attribute float aBirth; uniform float uGrow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed *= smoothstep( aBirth, aBirth + .45, uGrow );'); }; return m; };
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20261026);
  const vnoise = n => { const g = Float32Array.from({ length: (n + 1) * (n + 1) }, rnd), s = t => t * t * (3 - 2 * t);
    return (u, v) => { const X = u * n, Y = v * n, i = Math.min(n - 1, Math.floor(X)), j = Math.min(n - 1, Math.floor(Y)), fx = s(X - i), fy = s(Y - j), at = (a, b) => g[b * (n + 1) + a];
      return lerp(lerp(at(i, j), at(i + 1, j), fx), lerp(at(i, j + 1), at(i + 1, j + 1), fx), fy); }; };
  const leafTex = canvasTex(128, 128, x => {   // an ivy leaf: five shallow lobes, a notch at the stem, pale veins, a darker rim
    x.translate(64, 76); x.beginPath();
    for (let i = 0; i <= 240; i++) { const a = i / 240 * Math.PI * 2, r = 54 * (.74 + .26 * Math.cos(5 * a)) * (1 - .1 * Math.cos(a)); x.lineTo(r * Math.sin(a), -r * Math.cos(a) * .9); }
    const g = x.createRadialGradient(0, -10, 2, 0, -10, 62); g.addColorStop(0, '#f6f8ef'); g.addColorStop(.7, '#d9e0c9'); g.addColorStop(1, '#aab593'); x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineCap = 'round';
    [0, 1.26, -1.26, 2.4, -2.4].forEach((a, i) => { x.lineWidth = i ? 1.6 : 2.4; x.beginPath(); x.moveTo(0, 6); x.quadraticCurveTo(16 * Math.sin(a), -12 * Math.cos(a), 44 * Math.sin(a), -44 * Math.cos(a) * .9); x.stroke(); });
  });
  const frondTex = canvasTex(96, 320, x => {   // a fern frond: a curving rachis, paired pinnae that are themselves toothed, widest low
    x.fillStyle = '#e9f0dc'; x.strokeStyle = '#e9f0dc'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(48, 320); x.quadraticCurveTo(50, 160, 46, 4); x.stroke();
    for (let y = 300; y > 8; y -= 9) { const tt = 1 - y / 320, L = 40 * Math.sin(Math.PI * Math.min(1, .08 + tt * .98)) * (1 - tt * .45), cx = 48 + 2 * Math.sin(tt * 3);
      [-1, 1].forEach(s => { x.save(); x.translate(cx, y); x.rotate(s * (Math.PI / 2 - .5)); for (let k = 0; k < L; k += 4) { const w = 3.6 * (1 - k / L) + .8; x.beginPath(); x.ellipse(0, -k - 2, w, 2.6, 0, 0, Math.PI * 2); x.fill(); } x.restore(); }); }
  });
  const bladeTex = canvasTex(16, 128, x => { const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#9aa98a'); g.addColorStop(1, '#f6f8ee'); x.fillStyle = g; x.beginPath(); x.moveTo(1, 128); x.quadraticCurveTo(7, 50, 8, 0); x.quadraticCurveTo(9, 50, 15, 128); x.fill(); });
  const flowerTex = canvasTex(64, 64, x => {   // a daisy-like head: tinted per instance into daisies, poppies, buttercups and cornflowers
    x.translate(32, 32); x.fillStyle = '#ffffff';
    for (let i = 0; i < 11; i++) { x.save(); x.rotate(i / 11 * Math.PI * 2); x.beginPath(); x.ellipse(0, -17, 5.2, 13, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    x.fillStyle = '#e9b93a'; x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fill();
  });
  const mossTex = canvasTex(256, 256, x => {   // a patch of moss over damp soil: blotchy, soft at its ragged edge
    const im = x.createImageData(256, 256), n1 = vnoise(9), n2 = vnoise(36), n3 = vnoise(70);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const u = i / 255, v = j / 255, r = Math.hypot(u - .5, v - .5) * 2, a = clamp((1 - r) * 2.1 + (n1(u, v) - .5) * 1.9 + (n2(u, v) - .5) * .6);
      const m = smooth(.35, .7, n2(u, v) * .7 + n3(u, v) * .3), k = (i + j * 256) * 4, tone = .8 + .4 * n3(u, v);
      im.data[k] = lerp(70, 104, m) * tone; im.data[k + 1] = lerp(60, 132, m) * tone; im.data[k + 2] = lerp(40, 52, m) * tone; im.data[k + 3] = 255 * smooth(.08, .5, a);
    }
    x.putImageData(im, 0, 0);
  });
  const LEAF_C = [0x3d6127, 0x4c7530, 0x5f8a37, 0x7aa043, 0x98b955].map(c => new THREE.Color(c));
  const FLOWER_C = [0xffffff, 0xfffbef, 0xf04a26, 0xffd23a, 0xf1a0b4, 0x7f95e8].map(c => new THREE.Color(c));
  const pickC = (cs, w) => cs[Math.min(cs.length - 1, Math.floor(Math.pow(rnd(), w || 1) * cs.length))];
  const leafC = age => LEAF_C[Math.min(4, Math.max(0, Math.round((1 - age) * 3 + rnd() * 1.6 - .3)))];   // old leaves near the root are darker, new ones at the tips paler
  const leafGeo = new THREE.PlaneGeometry(1, 1, 2, 2).translate(0, .5, 0);
  { const a = leafGeo.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, -.08 * Math.abs(a.getX(i)) * 2 + .05 * a.getY(i)); leafGeo.computeVertexNormals(); }   // a slight cup
  const frondGeo = (() => { const g = new THREE.PlaneGeometry(.42, 1, 1, 14).translate(0, .5, 0), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const t = a.getY(i), k = 1.9; a.setY(i, Math.sin(t * k) / k); a.setZ(i, (1 - Math.cos(t * k)) / k); } g.computeVertexNormals(); return g; })();
  const bladeGeo = (() => { const g = new THREE.PlaneGeometry(.07, .6, 1, 4).translate(0, .3, 0), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const t = a.getY(i) / .6; a.setZ(i, .16 * t * t); } g.computeVertexNormals(); return g; })();
  const headGeo = new THREE.PlaneGeometry(.17, .17);
  let shadowsStale = true;
  const tmpO = new THREE.Object3D(), tmpV = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0);
  // The hall's plants are built after the first frame, off the opening's critical path, and their shaders compiled before
  // they are shown, so neither the first frame nor the walk ever stalls on them.
  let firstDrawn = false; const plantQueue = [];
  const plantLater = (parent, make) => { const job = () => { const g = new THREE.Group(); g.add(...make()); renderer.compileAsync(g, camera, scene).catch(() => {}).then(() => { if (g.children.length) parent.add(g); mark('planted'); shadowsStale = true; }); };
    if (firstDrawn) setTimeout(job, 0); else plantQueue.push(job); };
  const withBirth = (geo, items) => { const g = geo.clone(); g.setAttribute('aBirth', new THREE.InstancedBufferAttribute(Float32Array.from(items, i => i.birth), 1)); return g; };
  // Fronds, grass and flowers: placed by a point, the way they face, a turn about it and a size.
  const foliage = (geo, tex, items, rough = .78, outside = false) => {
    const m = growify(outside ? new THREE.MeshBasicMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, fog: false })
      : new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: rough, metalness: 0, envMapIntensity: 0, emissive: 0x15210c, emissiveMap: tex }));
    const im = new THREE.InstancedMesh(withBirth(geo, items), m, Math.max(1, items.length));
    items.forEach((it, k) => { tmpO.position.copy(it.p); tmpO.lookAt(tmpV.copy(it.p).add(it.n)); tmpO.rotateZ(it.spin || 0); if (it.tilt) tmpO.rotateX(it.tilt); tmpO.scale.setScalar(it.s); tmpO.updateMatrix(); im.setMatrixAt(k, tmpO.matrix); im.setColorAt(k, it.c); });
    if (outside) daylit.push([m, m.color.clone()]);
    im.count = items.length; im.castShadow = !outside; im.receiveShadow = !outside; im.frustumCulled = false;
    if (!outside) im.customDepthMaterial = growify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: .5 }));
    return im;
  };
  // Leaves hang off their stem: each has the direction it points (stem to tip) and the way its face looks.
  const leafMesh = items => {
    const m = growify(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: .5, side: THREE.DoubleSide, roughness: .6, metalness: 0, envMapIntensity: 0, emissive: 0x15210c, emissiveMap: leafTex }));
    const im = new THREE.InstancedMesh(withBirth(leafGeo, items), m, Math.max(1, items.length)), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), M = new THREE.Matrix4();
    items.forEach((it, k) => { Y.copy(it.dir).normalize(); Z.copy(it.n).addScaledVector(Y, -it.n.dot(Y)).normalize(); X.crossVectors(Y, Z);
      M.makeBasis(X.multiplyScalar(it.s), Y.multiplyScalar(it.s), Z.multiplyScalar(it.s)).setPosition(it.p); im.setMatrixAt(k, M); im.setColorAt(k, it.c); });
    im.count = items.length; im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    im.customDepthMaterial = growify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: .5 }));
    return im;
  };
  // Stems: one tube per vine, merged, drawn out from the root as the walk reaches each point along it.
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x77714a, roughness: .9, metalness: 0, envMapIntensity: 0 });
  stemMat.onBeforeCompile = sh => { sh.uniforms.uGrow = grow;
    sh.vertexShader = 'attribute float aBirth; varying float vBirth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBirth = aBirth;');
    sh.fragmentShader = 'uniform float uGrow; varying float vBirth;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if ( vBirth + .2 > uGrow ) discard;'); };
  const stemMesh = stems => {
    const geos = stems.filter(s => s.pts.length > 2).map(s => {
      const segs = s.pts.length, g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s.pts), segs, s.r, 3, false), b = new Float32Array(g.attributes.position.count);
      for (let i = 0; i <= segs; i++) { const v = s.bs[Math.min(s.bs.length - 1, Math.round(i / segs * (s.bs.length - 1)))]; for (let j = 0; j <= 3; j++) b[i * 4 + j] = v; }
      g.setAttribute('aBirth', new THREE.BufferAttribute(b, 1)); return g; });
    const o = new THREE.Mesh(geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry(), stemMat); o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; return o;
  };
  // Moss: soft patches on the stone, spreading from their middle.
  const mossMesh = items => {
    const m = growify(new THREE.MeshStandardMaterial({ map: mossTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 1, metalness: 0, envMapIntensity: 0 }));
    const im = new THREE.InstancedMesh(withBirth(new THREE.PlaneGeometry(1, 1), items), m, Math.max(1, items.length));
    items.forEach((it, k) => { tmpO.position.copy(it.p); tmpO.lookAt(tmpV.copy(it.p).add(it.n)); tmpO.rotateZ(rnd() * 6.3); tmpO.scale.set(it.s * (.8 + rnd() * .4), it.s, 1); tmpO.updateMatrix(); im.setMatrixAt(k, tmpO.matrix); });
    im.count = items.length; im.receiveShadow = true; im.frustumCulled = false; im.renderOrder = 1; return im;
  };
  const green = () => ({ stems: [], leaves: [], moss: [], fronds: [] });
  // A vine climbs a surface (u, v → point and normal) from its root, pulled toward a heading, wandering a little, and puts out
  // a leaf on alternate sides every few centimetres; the leaves at the root are older and larger.
  const vine = (surf, u, v, a, len, o, G, depth = 0) => {
    const step = .06, pts = [], bs = []; let since = 0, side = rnd() < .5 ? -1 : 1;
    for (let d = 0; d < len; d += step) {
      a += (rnd() - .5) * (o.wander || .4); a += ((o.pull ?? a) - a) * (o.pullK || .08);
      const nu = u + Math.cos(a) * step, nv = v + Math.sin(a) * step;
      if (o.stop && o.stop(nu, nv)) break;
      const q = surf(nu, nv); if (o.skip && o.skip(q.p)) break;
      const prev = surf(u, v).p, tan = q.p.clone().sub(prev).normalize(); u = nu; v = nv;
      const birth = o.birth + d * (o.rate ?? .12), age = 1 - d / len;
      pts.push(q.p.clone().addScaledVector(q.n, .025)); bs.push(birth);
      if ((since += step) >= (o.gap || .11)) { since = 0; side = -side;
        if (rnd() < (o.density || .92)) {
          const perp = new THREE.Vector3().crossVectors(q.n, tan).multiplyScalar(side);
          const dir = perp.multiplyScalar(.85).addScaledVector(q.n, .5).addScaledVector(DOWNV, .3 + rnd() * .3).addScaledVector(tan, .15).normalize();
          G.leaves.push({ p: q.p.clone().addScaledVector(q.n, .035), dir, n: q.n.clone().addScaledVector(UPV, .3).addScaledVector(perp, .2).normalize(), s: (o.size || .24) * (.55 + .55 * age) * (.85 + rnd() * .3), birth: birth + .06, c: leafC(age) });
        }
      }
      if (depth < 2 && d > .3 && rnd() < (o.branch || .025)) vine(surf, u, v, a + (rnd() < .5 ? -1 : 1) * (.5 + rnd() * .5), (len - d) * (.35 + rnd() * .35), { ...o, birth, r: (o.r || .012) * .75 }, G, depth + 1);
    }
    if (pts.length > 2) G.stems.push({ pts, bs, r: o.r || .012 });
  };
  // A strand hanging from a beam: it falls with a little sway, leaves turned out and down.
  const hang = (x, y, z, len, birth, G) => {
    const sw = rnd() * 6, pts = [], bs = []; let since = 0, side = 1;
    for (let d = 0; d < len; d += .06) {
      const p = new THREE.Vector3(x + Math.sin(d * 1.1 + sw) * .12, y - d, z + Math.sin(d * .8 + sw) * .14), b = birth + d * .12;
      pts.push(p); bs.push(b);
      if ((since += .06) >= .1) { since = 0; side = -side; const a = sw + d * 2.3 + side * 1.4, out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        G.leaves.push({ p: p.clone().addScaledVector(out, .03), dir: out.clone().addScaledVector(DOWNV, .6 + rnd() * .4).normalize(), n: out.clone().addScaledVector(UPV, .4).normalize(), s: .21 * (.6 + .5 * (1 - d / len)) * (.85 + rnd() * .3), birth: b + .06, c: leafC(1 - d / len) }); }
    }
    G.stems.push({ pts, bs, r: .011 });
  };
  // A fern: fronds rising from one crown and arching out, the inner ones upright and young.
  const fern = (p, n, s, birth, G) => {
    const k = 6 + Math.floor(rnd() * 6), a0 = rnd() * 6.3;
    for (let i = 0; i < k; i++) { const a = a0 + i / k * Math.PI * 2 + (rnd() - .5) * .5, inner = rnd() < .3;
      G.fronds.push({ p: p.clone().add(new THREE.Vector3((rnd() - .5) * .08, 0, (rnd() - .5) * .08)), n: new THREE.Vector3(Math.cos(a), inner ? 1.4 : .25, Math.sin(a)).normalize(), s: s * (inner ? .65 : .85 + rnd() * .35), spin: (rnd() - .5) * .25, tilt: inner ? -.6 : 0, birth: birth + rnd() * .35, c: pickC(LEAF_C, inner ? .5 : 1.3) }); }
  };
  const meadow = (x0, x1, z0, z1, n, birthAt, blades, heads, keep) => {   // grass, with flowers standing in it
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, rnd()), z = lerp(z0, z1, rnd()); if (keep && !keep(x, z)) continue;
      const a = rnd() * Math.PI * 2, birth = birthAt(x, z) + rnd() * .3;
      blades.push({ p: new THREE.Vector3(x, 0, z), n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), s: .6 + rnd() * 1.1, spin: (rnd() - .5) * .5, birth, c: new THREE.Color().setHSL(.2 + rnd() * .08, .45 + rnd() * .2, .3 + rnd() * .2) });
      if (rnd() < .07) { const h = .3 + rnd() * .55; heads.push({ p: new THREE.Vector3(x, h, z), n: new THREE.Vector3((rnd() - .5) * .8, 1, .6 + rnd()).normalize(), s: .8 + rnd() * .7, spin: rnd() * 6, birth: birth + .2, c: pickC(FLOWER_C) });
        blades.push({ p: new THREE.Vector3(x, 0, z), n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), s: h / .6, spin: 0, birth, c: new THREE.Color(.25, .38, .14) }); }
    }
  };
  const greenery = G => [stemMesh(G.stems), leafMesh(G.leaves), mossMesh(G.moss), foliage(frondGeo, frondTex, G.fronds)];

  // Light through the windows: tall arched windows high in both side walls. The sun is on the left, so the left-hand windows
  // let down shafts that cross the hall to the floor and the right-hand wall; the right-hand ones only show the dawn sky. A
  // shaft is drawn as a close stack of thin slices across the hall, each lit only where a ray from that point back toward
  // the sun passes through a window, so it matches the patch of light it throws. As the sun climbs, the patches slide down
  // the right-hand wall and across the floor.
  const WIN = { depth: .6, list: [   // narrow and high near the entrance, opening up toward the door, so the hall brightens as you go
    { z: -6.75, hw: .3, sill: 4.1, spring: 5.7 }, { z: -15.75, hw: .42, sill: 3.6, spring: 5.55 }, { z: -24.75, hw: .56, sill: 3.0, spring: 5.4 },
    { z: -33.75, hw: .72, sill: 2.4, spring: 5.25 }, { z: -42.75, hw: .9, sill: 1.8, spring: 5.1 }] };
  const winD = (w, dz, ry) => (ry < w.spring ? Math.min(w.hw - dz, ry - w.sill) : w.hw - Math.hypot(dz, ry - w.spring));   // inside a window's arch, in metres
  const ROOF = { wallX: -7.2 };
  // Each slice is fitted to its own beam: the vertex shader places the slice's four corners around the band of light the
  // window throws at that depth, for the sun as it is this frame, so a shaft only shades the pixels it actually covers
  // (filling the hall's whole width with slices cost two-thirds of the frame).
  const shaftU = { sun: { value: new THREE.Vector3(1, -1, 0).normalize() }, k: { value: 0 }, t: { value: 0 }, col: { value: new THREE.Color() }, wallX: { value: -7.2 }, hallW: { value: 7.2 },
    wins: { value: WIN.list.map(w => new THREE.Vector4(w.z, w.hw, w.sill, w.spring)) } };
  const sliceMat = new THREE.ShaderMaterial({ uniforms: shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `attribute vec2 corner; attribute float aZ, aWin; uniform vec3 sun; uniform float wallX, hallW; uniform vec4 wins[${WIN.list.length}];
      varying vec3 vW; varying float vS; flat varying int vWin;
      void main(){
        vec4 w = wins[int(aWin + .5)]; float top = w.w + w.y, sx = max(.05, sun.x), sy = min(-.05, sun.y);
        float s0 = 0., s1 = min(2. * hallW / sx, (top + .1) / -sy);
        if (abs(sun.z) > 1e-4) { float a = (aZ - w.x - w.y - .2) / sun.z, b = (aZ - w.x + w.y + .2) / sun.z; s0 = max(s0, min(a, b)); s1 = min(s1, max(a, b)); }
        s1 = max(s1, s0);
        float sl = mix(s0, s1, corner.x);
        vec3 p = vec3(wallX + sun.x * sl, mix(w.z - .08, top + .08, corner.y) + sun.y * sl, aZ);
        vW = p; vS = sl; vWin = int(aWin + .5); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform vec3 sun, col; uniform float k, t; uniform vec4 wins[${WIN.list.length}]; varying vec3 vW; varying float vS; flat varying int vWin;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec4 w = wins[vWin]; vec3 r = vW - sun * vS;   // where this point's sunlight came through the window
        float dz = abs(r.z - w.x), d = r.y < w.w ? min(w.y - dz, r.y - w.z) : w.y - length(vec2(dz, r.y - w.w));
        float lit = smoothstep(-.03, .16, d);
        float dust = .72 + .28 * vn(vec2(vW.x * .6 + t * .04, vW.y * .9 + vW.z * .7 - t * .015));
        float along = smoothstep(0., 1.2, vW.y) * smoothstep(0., 1.4, vS) * (1. - .45 * smoothstep(5., 15., vS));
        float near = smoothstep(3.5, 12., distance(vW, cameraPosition));   // a shaft fades as the camera comes up to it, so walking through one never floods the frame
        gl_FragColor = vec4(col * (k * lit * dust * along * near), 1.);
      }` });
  const litAt = (x, y, z, sd) => {   // the same test in script, for the dust
    const s = (x - ROOF.wallX) / Math.max(.05, sd.x); if (s < 0) return 0; const ry = y - sd.y * s, rz = z - sd.z * s;
    return WIN.list.reduce((m, w) => Math.max(m, smooth(-.03, .16, winD(w, Math.abs(rz - w.z), ry))), 0);
  };

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
    tablet.children.slice().forEach(c => { tablet.remove(c); c.traverse(o => o.geometry && o.geometry.dispose()); });
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
    // Ivy at the entrance: rooted in moss at the foot of the wall, climbing beside the doorway to the foot of the tablet, and
    // spilling over the top of the wall; it never crosses the doorway, the archivolt or the tablet.
    const fx = L.FW / 2 + fw, fy0 = L.cy - L.FH / 2 - fw, fy1 = L.cy + L.FH / 2 + fw, E = green();
    const front = (u, v) => ({ p: new THREE.Vector3(u, v, 0), n: new THREE.Vector3(0, 0, 1) });
    const skip = p => (Math.abs(p.x) < fx + .04 && p.y > fy0 - .04 && p.y < fy1 + .04) || (Math.abs(p.x) < RX + .4 && p.y < SPRING + Math.sqrt(Math.max(0, (RX + .4) ** 2 - p.x * p.x)));
    const up = { pull: Math.PI / 2, pullK: .05, rate: .06, size: .27, skip, branch: .05 };
    [[RX + .75, -1, 7], [RX + 1.9, -.6, 5], [-(fx + .6), -1.2, 9], [fx + 1.1, -.5, 6], [-(fx + 2.6), -.9, 9], [fx + 3, -.7, 7.5]].forEach(([x, b, len], i) => {
      E.moss.push({ p: new THREE.Vector3(x, .004, .45), n: UPV, s: 1.3 + rnd() * .6, birth: b - .4 }, { p: new THREE.Vector3(x + (rnd() - .5) * .3, .32, .012), n: new THREE.Vector3(0, 0, 1), s: .8 + rnd() * .4, birth: b - .3 });
      if (i % 2 === 0) fern(new THREE.Vector3(x + .25, .01, .4), UPV, .75, b - .2, E);
      vine(front, x, .05, Math.PI / 2 + (rnd() - .5) * .3, len, { ...up, birth: b, pull: Math.PI / 2 + (x < 0 ? .1 : -.1) }, E);
    });
    const down = { pull: -Math.PI / 2, pullK: .06, rate: .06, size: .27, skip, branch: .06 };
    [[-(fx + .3), -1.2, 9], [-(fx - 1.2), -1, 6], [fx - .8, -.9, 6], [fx + .6, -.5, 9]].forEach(([x, b, len]) => vine(front, x, 16, -Math.PI / 2, len, { ...down, birth: b }, E));
    plantLater(tablet, () => greenery(E));
    keys = makeKeys();
  };

  // The hall runs from the entrance wall to the far door and no further: beyond the door there is only daylight.
  // Tall screens see a narrower hall, so its columns stand inside the frame instead of beyond its edges.
  const hall = new THREE.Group(); scene.add(hall);
  let hallKey = '';
  const buildHall = () => {
    const tall = innerWidth / innerHeight < .95, key = tall ? 'tall' : 'wide'; if (key === hallKey) return; hallKey = key;
    hall.children.slice().forEach(c => { hall.remove(c); c.traverse(o => o.geometry && o.geometry.dispose()); });
    const CX = tall ? 2.3 : 3.6, HW = tall ? 4.7 : 7.2, CW = tall ? 10 : 16, DW = tall ? 5.3 : 8, DR = tall ? 1.9 : 2.4;
    sconces.forEach(sc => { sc.l.position.x = sc.side * (HW - .35); sc.s.position.x = sc.l.position.x; sc.s.scale.setScalar(tall ? .34 : .6); });   // the wide hall's flames throw further, so they show bigger
    const P = { parent: hall };
    mesh(new THREE.PlaneGeometry(40, 62), floorMat, { ...P, pos: [0, 0, -17], rot: [-Math.PI / 2, 0, 0] });
    // The roof: solid, on cross beams over each pair of columns. Light comes in only by the windows in the side walls.
    ROOF.wallX = -HW; shaftU.wallX.value = -HW;
    mesh(new THREE.BoxGeometry(HW * 2 + .4, .3, 46), ceilMat, { ...P, pos: [0, 7.35, -24.2], cast: true });
    { const zs = []; for (let z = -4.5; z > -46.5; z -= 4.5) zs.push(z);
      const crs = new THREE.InstancedMesh(new THREE.BoxGeometry(HW * 2, .34, .7), stoneMat, zs.length);
      zs.forEach((z, i) => { tmpO.position.set(0, 7.02, z); tmpO.rotation.set(0, 0, 0); tmpO.scale.setScalar(1); tmpO.updateMatrix(); crs.setMatrixAt(i, tmpO.matrix); });
      crs.castShadow = crs.receiveShadow = true; hall.add(crs);
      ROOF.hallW = HW; shaftU.hallW.value = HW;
      const per = LOW ? 7 : 14, n = WIN.list.length * per, corner = new Float32Array(n * 8), aZ = new Float32Array(n * 4), aWin = new Float32Array(n * 4), idx = [];
      WIN.list.forEach((w, wi) => { for (let i = 0; i < per; i++) { const q = wi * per + i, z = lerp(w.z - w.hw - .25, w.z + w.hw + .9, (i + .5) / per);
        corner.set([0, 0, 1, 0, 0, 1, 1, 1], q * 8); aZ.fill(z, q * 4, q * 4 + 4); aWin.fill(wi, q * 4, q * 4 + 4); idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3)); g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
      g.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1)); g.setAttribute('aWin', new THREE.BufferAttribute(aWin, 1)); g.setIndex(idx);
      const shafts = new THREE.Mesh(g, sliceMat); shafts.frustumCulled = false; shafts.renderOrder = 5; hall.add(shafts); }
    // The side walls, with their windows: thick enough that each window has a reveal, which softens the edge of its shaft.
    [-1, 1].forEach(s => {
      const sh = new THREE.Shape(); sh.moveTo(0, -.6); sh.lineTo(47, -.6); sh.lineTo(47, 7.6); sh.lineTo(0, 7.6); sh.closePath();
      WIN.list.forEach(w => { const u = -w.z, h = new THREE.Path(); h.moveTo(u - w.hw, w.sill); h.lineTo(u + w.hw, w.sill); h.lineTo(u + w.hw, w.spring); h.absarc(u, w.spring, w.hw, 0, Math.PI, false); h.lineTo(u - w.hw, w.sill); sh.holes.push(h); });
      mesh(new THREE.ExtrudeGeometry(sh, { depth: WIN.depth, bevelEnabled: false, curveSegments: 24 }).rotateY(Math.PI / 2), wallMat, { ...P, pos: [s < 0 ? -HW - WIN.depth : HW, 0, 0], cast: true });
    });
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
    mesh(new THREE.ExtrudeGeometry(archShape([-DW, -.5, DW, 8.2], DR, 3.6, -.3), { depth: 1, bevelEnabled: false, curveSegments: 48 }), wallMat, { ...P, pos: [0, 0, -47], cast: true });   // the far door
    mesh(new THREE.PlaneGeometry(400, 70), skyMat, { ...P, pos: [0, 28, -110], receive: false });   // beyond the far door: sky
    mesh(new THREE.PlaneGeometry(160, 70), groundMat, { ...P, pos: [0, .005, -82], rot: [-Math.PI / 2, 0, 0] });   // and a meadow
    // Growth: moss and soil gather where the floor meets the walls and the column plinths, more of it toward the door; ferns
    // and ivy root in it; ivy climbs the walls and the columns, and strands hang from the cross beams over the aisles, toward
    // the light. Near the door grass and flowers come up through the moss. Each piece begins at its own point on the walk.
    const depth = z => clamp(-z / 44), hb = f => lerp(.5, 3.4, f), G = green(), blades = [], heads = [];
    [-1, 1].forEach(s => {
      for (let z = -2.4; z > -46.4; z -= .8 + rnd() * .9) {
        const f = depth(z); if (rnd() > .45 + f * .7) continue;
        const b = hb(f) + rnd() * .3, x = s * (HW - .3 - rnd() * .3);
        G.moss.push({ p: new THREE.Vector3(x, .003, z), n: UPV, s: .9 + rnd() * 1.1 + f * .6, birth: b - .3 });
        if (rnd() < .45) G.moss.push({ p: new THREE.Vector3(s * (HW - .015), .25 + rnd() * .2, z + (rnd() - .5) * .4), n: new THREE.Vector3(-s, 0, 0), s: .6 + rnd() * .5, birth: b - .2 });
        if (rnd() < .3 + f * .6) fern(new THREE.Vector3(x + s * .08, .01, z), UPV, .7 + rnd() * .4 + f * .3, b, G);
        if (rnd() < .45 + f * .4) { const wall = (u, v) => ({ p: new THREE.Vector3(s * (HW - .02), v, u), n: new THREE.Vector3(-s, 0, 0) });
          vine(wall, z, .05, Math.PI / 2 + (rnd() - .5) * .5, lerp(3, 7, f) * (.6 + rnd() * .5), { pull: Math.PI / 2, pullK: .05, birth: b, rate: .07, skip: q => WIN.list.some(w => Math.abs(q.z - w.z) < w.hw + .05 && q.y > w.sill - .05), size: .25, branch: .05, stop: (u, v) => v > 6.95 }, G); }
      }
    });
    COLS.forEach(([x, z]) => {
      const f = depth(z); if (rnd() > .55 + f) return;
      const b = hb(f) + rnd() * .3, a = rnd() * 6.3, mp = new THREE.Vector3(x + Math.cos(a) * .72, .004, z + Math.sin(a) * .72);
      G.moss.push({ p: mp, n: UPV, s: .8 + rnd() * .6 + f * .5, birth: b - .3 });
      if (rnd() < .5 + f * .4) fern(mp.clone().setY(.01), UPV, .6 + f * .4, b, G);
      if (f > .08) { const r = .47, col = (u, v) => { const th = u / r; return { p: new THREE.Vector3(x + Math.cos(th) * r, v, z + Math.sin(th) * r), n: new THREE.Vector3(Math.cos(th), 0, Math.sin(th)) }; };
        for (let i = 0; i < (f > .6 ? 2 : 1); i++) vine(col, (a + (rnd() - .5) * .6) * r, .55, Math.PI / 2 + (rnd() - .5) * .4, lerp(1.6, 5.8, f) * (.7 + rnd() * .4), { pull: Math.PI / 2 + .45, pullK: .05, birth: b + .15, rate: .07, size: .24, stop: (u, v) => v > 5.85 }, G); }
    });
    for (let z = -4.5; z > -46; z -= 4.5) { const f = depth(z), n = Math.round(1.5 + f * 4 + rnd() - .3);
      for (let i = 0; i < n; i++) { const side = rnd() < .5 ? -1 : 1; hang(side * lerp(CX + .7, HW - .4, rnd()), 6.85, z + (rnd() - .5) * .4, lerp(.6, 2.6, f) * (.6 + rnd() * .5), hb(f) + .3 + rnd() * .3, G); } }
    const doorPatches = [];
    for (let i = 0; i < 30; i++) { const z = -35 - rnd() * 11.5, f = clamp((-z - 35) / 11.5); if (rnd() > .3 + f) continue;
      const x = (rnd() - .5) * 2 * (HW - .6), sz = 1 + rnd() * 1.6 + f * 1.2; if (COLS.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 1)) continue;
      doorPatches.push([x, z, sz * .36]); G.moss.push({ p: new THREE.Vector3(x, .003, z), n: UPV, s: sz, birth: lerp(5.0, 6.0, f) }); }
    meadow(-HW + .2, HW - .2, -34, -46.8, LOW ? 1600 : 3200, (x, z) => lerp(5.3, 6.3, clamp((-z - 35) / 11.5)), blades, heads, (x, z) => doorPatches.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r));
    const oBlades = [], oHeads = []; meadow(-22, 22, -47.3, -90, LOW ? 3500 : 8000, () => -9, oBlades, oHeads);
    oBlades.forEach(b => { b.s *= 1.5; }); oHeads.forEach(h => { h.p.y *= 1.5; h.s *= 1.3; });
    plantLater(hall, () => [...greenery(G), foliage(bladeGeo, bladeTex, blades, .9), foliage(headGeo, flowerTex, heads, .7),
      foliage(bladeGeo, bladeTex, oBlades, .9, true), foliage(headGeo, flowerTex, oHeads, .7, true)]);
  };

  /* ---------- Lights ---------- */
  // The pointer holds a shaft of sun, a spot from high on the left aimed where the pointer meets the stone. `torch`
  // keeps its name and marks where the shaft lands, so the lens and the KJV line read it as before.
  const torch = new THREE.Object3D(); scene.add(torch);
  const beam = new THREE.SpotLight(0xffc68c, 0, 0, .13, .95, 0);
  beam.castShadow = true; beam.shadow.autoUpdate = false; beam.shadow.mapSize.setScalar(LOW ? 1024 : 2048); beam.shadow.camera.near = 6; beam.shadow.camera.far = 30; beam.shadow.bias = -.0006; beam.shadow.normalBias = .06;
  scene.add(beam, beam.target);
  const BEAM_DIR = new THREE.Vector3(-.56, -.6, -.57).normalize();   // the way the shaft travels: down and to the left, across the wall at a slant
  const moon = new THREE.AmbientLight(0x7487a8, .16);
  const hemi = new THREE.HemisphereLight(0x8ea4c8, 0x3a3631, 0);
  const sun = new THREE.DirectionalLight(0xfff4e0, 0);
  sun.castShadow = true; sun.shadow.autoUpdate = false; sun.shadow.mapSize.setScalar(LOW ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .08;
  scene.add(moon, hemi, sun, sun.target);
  // As the day comes on, the sunlit stone lights the rest of the hall: a warm bounce that rises as you walk.
  const bounce = new THREE.HemisphereLight(0xffdcb0, 0xa4835a, 0); scene.add(bounce);
  // Near the end, daylight from the meadow comes in through the far door (and only the door: the far wall casts shadows)
  // and runs along the floor toward you.
  const doorLight = new THREE.SpotLight(0xfff0d4, 0, 0, .5, .6, 0);
  doorLight.position.set(0, 5.2, -66); doorLight.target.position.set(0, 0, -30);
  doorLight.castShadow = true; doorLight.shadow.autoUpdate = false; doorLight.shadow.mapSize.setScalar(LOW ? 512 : 1024); doorLight.shadow.camera.near = 8; doorLight.shadow.camera.far = 70; doorLight.shadow.bias = -.0006; doorLight.shadow.normalBias = .05;
  scene.add(doorLight, doorLight.target);
  const dawnSun = new THREE.Color(0xffbf8f), noonSun = new THREE.Color(0xfff0d8), dawnFog = new THREE.Color(0x2b3546), lateFog = new THREE.Color(0x56627a), dawnSky = new THREE.Color(0x3f4f6c), daySky = new THREE.Color(0xa6bfd3), sunDir = new THREE.Vector3(), fwd = new THREE.Vector3(), focus = new THREE.Vector3();
  // the shaft itself, faintly visible in the dawn air: a cone from high on the left down to where it lands
  const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { k: { value: 0 } },
    vertexShader: 'varying float vAlong; varying vec3 vN, vV; void main(){ vAlong = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float k; varying float vAlong; varying vec3 vN, vV; void main(){ float edge = pow(abs(dot(vN, vV)), 2.5); float along = smoothstep(0., .35, vAlong) * smoothstep(1., .55, vAlong); gl_FragColor = vec4(vec3(1., .9, .74) * edge * along * k, 1.); }', side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, .04, 1, 48, 1, true).translate(0, -.5, 0).rotateX(-Math.PI / 2), shaftMat); shaft.frustumCulled = false; scene.add(shaft);
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
  const EN = ww.rm ? 0 : (LOW ? 60 : 160);
  const ePos = new Float32Array(EN * 3), eCol = new Float32Array(EN * 3), eVel = new Float32Array(EN * 3), eAge = new Float32Array(EN).fill(9), eLife = new Float32Array(EN).fill(1);
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3)); eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: .026, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  embers.frustumCulled = false; scene.add(embers);

  /* ---------- Post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .3, .45, .9);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  // The teaser's print, lightly: lifted blacks, a soft vignette and moving grain.
  const film = new ShaderPass({ uniforms: { tDiffuse: { value: null }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float t; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + t * 7.) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = vUv - .5; c.rgb = mix(vec3(.075, .07, .062), c.rgb, .94) * (1. - dot(q, q) * .6) ; float l = dot(c.rgb, vec3(.299, .587, .114)); c.rgb += (h(vUv * 1000.) - .5) * .028 * smoothstep(.04, .4, l); gl_FragColor = c; }' });
  composer.addPass(film);
  composer.setPixelRatio(pr);
  const setPR = v => { pr = v; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); };

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
      { p: 7.0, pos: [0, 2.1, -38.5], look: [0, 3.1, -52] },   // the walk ends at the threshold: the far door frames the daylight
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
  const rebuild = () => { shadowsStale = true; buildHall(); buildTablet(); keys = makeKeys(); pc = posCurve(); lc = lookCurve(); pathAnchors(); };
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
  const lastBeam = new THREE.Vector3(); let lastP = -1, frameNo = 0, emaMs = 16.7, slowFor = 0, fastFor = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    if (document.hidden || !innerWidth || !innerHeight) return;   // hidden, or laid out at zero size: nothing to draw
    if (sized !== innerWidth + 'x' + innerHeight) fit();   // a resize (or a page first laid out at zero size) rebuilds the walk
    const frameMs = now - last, dt = Math.min(.05, frameMs / 1000); last = now;
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
    // The shaft of sun: on the wall it lands where the pointer meets the stone; in the hall it fades, and the risen sun takes over.
    ndc.set(sp.x, sp.y); ray.setFromCamera(ndc, camera); dir.copy(ray.ray.direction);
    const onWall = 1 - smooth(1.35, 2.25, cp);
    tHall.copy(camera.position).addScaledVector(dir, 2.4).addScaledVector(up, -.15);
    if (onWall > 0 && camera.position.z > 1.6 && dir.z < -.05) { tWall.copy(ray.ray.origin).addScaledVector(dir, (.02 - ray.ray.origin.z) / dir.z); tHall.lerp(tWall, onWall); }
    const lit = skipIntro ? 1 : smooth(1.25, 2.4, t) * (1 + .3 * Math.max(0, 1 - Math.abs(t - 1.75) / .5));   // the shaft breaks through
    const ignite = skipIntro ? 0 : Math.max(0, 1 - Math.abs(t - 1.65) / .5);
    torch.position.copy(tHall);
    beam.target.position.copy(tHall); beam.position.copy(tHall).addScaledVector(BEAM_DIR, -16); beam.intensity = 6.5 * lit * onWall;
    shaft.position.copy(tHall); shaft.lookAt(tmpV.copy(tHall).sub(BEAM_DIR)); shaft.scale.set(16 * Math.tan(.13), 16 * Math.tan(.13), 16); shaftMat.uniforms.k.value = .055 * lit * onWall;
    halo.visible = core.visible = false; sconces.forEach(sc => { sc.l.intensity = 0; sc.s.visible = false; });
    const reading = html.classList.contains('reading') ? .25 : 1;
    camera.getWorldDirection(fwd);
    // Dawn, advancing as you walk: the sun clears the left-hand wall and its shafts come down through the roof, low and long
    // at first, then higher and shorter, the stripes on the floor sliding as it climbs. It never lights the entrance wall.
    const out = smooth(5.6, 7, p), rise = smooth(1.8, 6.8, p), sunK = smooth(1.4, 3.0, p);
    sunDir.set(1, -lerp(.3, .72, rise), lerp(.06, .03, rise)).normalize();
    focus.set(0, 3, -24); sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, -60);   // fixed on the hall, so its shadow never chases the camera
    sun.color.copy(dawnSun).lerp(noonSun, smooth(2, 6.8, p)); sun.intensity = lerp(1.9, 2.8, rise) * sunK + .8 * out;
    shaftU.sun.value.copy(sunDir); shaftU.k.value = (LOW ? .05 : .027) * sunK * (1 - .5 * out); shaftU.col.value.copy(sun.color); shaftU.t.value = t;
    // Dust: on the wall it turns in the first shaft; in the hall it fills the air, and shows only where it crosses the sun.
    for (let i = 0; i < EN; i++) {
      eAge[i] += dt;
      if (eAge[i] > eLife[i] && lit > .5 && Math.random() < dt * 10) {
        eAge[i] = 0; eLife[i] = 4 + Math.random() * 5;
        if (onWall > .5) { const k = .3 + Math.random() * 7, r = .15 + k * .12; tmpV.copy(tHall).addScaledVector(BEAM_DIR, -k); ePos[i * 3] = tmpV.x + (Math.random() - .5) * r; ePos[i * 3 + 1] = tmpV.y + (Math.random() - .5) * r; ePos[i * 3 + 2] = tmpV.z + Math.random() * r; }
        else { tmpV.copy(camera.position).addScaledVector(fwd, 1.5 + Math.random() * 10).addScaledVector(right, (Math.random() - .5) * 9).addScaledVector(up, (Math.random() - .4) * 5); ePos[i * 3] = tmpV.x; ePos[i * 3 + 1] = clamp(tmpV.y, .3, 6.8); ePos[i * 3 + 2] = tmpV.z; }
        eVel[i * 3] = (Math.random() - .5) * .04; eVel[i * 3 + 1] = (Math.random() - .35) * .03; eVel[i * 3 + 2] = (Math.random() - .5) * .04;
      }
      ePos[i * 3] += (eVel[i * 3] + Math.sin(t * .6 + i) * .015) * dt; ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt; ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
      const a = eAge[i] / eLife[i], life = a >= 1 ? 0 : Math.sin(Math.PI * a);
      const k = life * (onWall > .5 ? .35 : .5 * sunK * litAt(ePos[i * 3], ePos[i * 3 + 1], ePos[i * 3 + 2], sunDir));
      eCol[i * 3] = k; eCol[i * 3 + 1] = .9 * k; eCol[i * 3 + 2] = .74 * k;
    }
    if (EN) { eGeo.attributes.position.needsUpdate = true; eGeo.attributes.color.needsUpdate = true; }
    // The lens follows the light on the wall: where its beam meets the tablet (in the tablet's uv), any gilded word it rests on
    // turns to WORD, written in over about a third of a second, and back again once the light moves on.
    // The lens follows the beam: every gilded word the shaft of light falls on turns to WORD, written in over about a third of
    // a second, and back again once the light moves on. A word counts as lit when its middle or either end is inside the cone.
    const coneIn = Math.cos(.13 * .7), coneOut = Math.cos(.13 * 1.05);
    const lightAt = (x, y) => (onWall * lit > .5 ? smooth(coneOut, coneIn, tmpV.set(x, y, .016).sub(beam.position).normalize().dot(BEAM_DIR)) : 0);
    const ease = ww.rm ? 1 : Math.min(1, dt * 7), wordW = lens.wordW.value;
    lens.rects.value.forEach((r, i) => {
      const y = ((r.y + r.w) / 2 - .5) * L.FH + L.cy, x0 = (r.x - .5) * L.FW, x1 = (r.z - .5) * L.FW;
      const on = Math.max(lightAt((x0 + x1) / 2, y), lightAt(x0 + (x1 - x0) * .2, y), lightAt(x1 - (x1 - x0) * .2, y)) > .5 ? 1 : 0;
      wordW[i] = Math.abs(on - wordW[i]) < .004 ? on : wordW[i] + (on - wordW[i]) * ease;
    });
    // Once the KJV line is on screen, the light on a gilded word picks out the matching "Word" in it.
    const kjvOn = smooth(.55, .95, cp);
    for (let i = 0; i < 3; i++) {
      const b = logosBoxes[i], reach = b ? lightAt(b.x, b.y) : 0, g = Math.round(reach * kjvOn * 1000) / 1000;
      if (g !== gLast[i]) { gLast[i] = g; html.style.setProperty('--g' + i, String(g)); }
    }
    // The hall's air stays blue and dim behind the sun; past the door it is day.
    const climb = smooth(0, 7, p);
    const dawnUp = lerp(.22, 1, Math.min(1, lit));   // the opening: a moment of only the gold words in the blue dark, then the dawn comes up with the light
    hemi.intensity = (lerp(.62, .9, smooth(0, 6, p)) + .5 * out) * dawnUp; moon.intensity = .16 * (1 - out) * dawnUp;
    const doorGlow = lerp(.16, 1, smooth(1.1, 2.3, p));   // the far door is only a glimmer until you are through the entrance arch
    daylit.forEach(([m, c]) => m.color.copy(c).multiplyScalar(doorGlow));
    bounce.intensity = .62 * Math.pow(smooth(2.2, 7, p), 1.4); doorLight.intensity = 3.2 * smooth(4.4, 6.8, p);
    goldMat.envMapIntensity = lerp(.26, .7, out);
    fog.color.copy(dawnFog).lerp(lateFog, smooth(0, 5.6, p)).lerp(daylight, out * .5); fog.density = lerp(.032, .014, climb);
    scene.background.copy(dawnSky).lerp(daySky, rise * rise); skyDay.value = smooth(4.5, 7, p);   // seen through the roof
    grow.value = p + .1;
    bloom.strength = .3 + ignite * .5;
    film.uniforms.t.value = t % 10;
    // Shadow maps redraw only when something they depend on changes: the walk (sun angle, growth), the beam moving on the wall,
    // new plants, a rebuild. Standing still, none of the three redraws.
    const pMoved = Math.abs(p - lastP) > 1e-4, beamMoved = beam.intensity > 0 && tHall.distanceToSquared(lastBeam) > 1e-6;
    if (pMoved || shadowsStale) { sun.shadow.needsUpdate = sun.intensity > 0; doorLight.shadow.needsUpdate = doorLight.intensity > 0; }
    if (beamMoved || pMoved || shadowsStale) beam.shadow.needsUpdate = beam.intensity > 0;
    shadowsStale = false; lastBeam.copy(tHall);
    // Idle: with nothing moving (no walk, no pointer for a moment, no word changing, opening done) draw every other frame;
    // the dust and grain still drift, at half the cost. The governor only reads frames drawn back to back.
    const settling = lens.wordW.value.some(w => w > .002 && w < .998), moving = pMoved || (now - ww.pointer.moved) < 1500 || t < 7.5 || settling || rmFade < 1;
    lastP = p; frameNo++;
    if (moving) {
      if (!firstFrame && frameMs < 250) { emaMs = lerp(emaMs, frameMs, .08);
        if (emaMs > 20.5) { fastFor = 0; if ((slowFor += frameMs) > 900 && pr > PR_MIN) { setPR(Math.max(PR_MIN, Math.round((pr - .15) * 100) / 100)); slowFor = 0; emaMs = 16.7; } }
        else if (emaMs < 14.5) { slowFor = 0; if ((fastFor += frameMs) > 4000 && pr < PR_MAX) { setPR(Math.min(PR_MAX, Math.round((pr + .1) * 100) / 100)); fastFor = 0; } }
        else slowFor = fastFor = 0; }
      composer.render();
    } else if (frameNo % 2 === 0) composer.render();
    if (firstFrame) { firstFrame = false; html.classList.add('lit'); mark('first-frame'); firstDrawn = true; setTimeout(() => plantQueue.splice(0).forEach(f => f()), 30); }
    // Once the opening has played (or was skipped), finish the heavy work the first frame did not need.
    if (!afterOpening && (skipIntro ? t > .4 : t > 6.4)) { afterOpening = true; upgradeCarve(); }
  };

  const fit = () => {   // size everything to the window; called whenever the frame loop sees the window's size change
    sized = innerWidth + 'x' + innerHeight;
    renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth, innerHeight);
    const before = layoutKey; rebuild(); if (layoutKey !== before && afterOpening) upgradeCarve();
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); html.classList.add('scene-failed'); });
  window.__scene = { scene, camera, renderer, composer, pr: () => pr, torch, sun, hemi, bloom, panelMat, goldMat, lens, marks };   // inspection handle for review tooling
  requestAnimationFrame(frame);
}
