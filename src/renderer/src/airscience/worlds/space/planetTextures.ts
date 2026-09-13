/**
 * Shared procedural texture generators for all solar-system planets.
 * Used by both Planet3DRender (card view) and PlanetExplorer3D (full-screen view).
 */

import * as THREE from 'three';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function makeNoise(seed: number): {
  noise2: (x: number, y: number) => number;
  fbm2: (x: number, y: number, oct?: number) => number;
} {
  let s = ((seed * 9781) + 1) >>> 0;
  function rnd(): number {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 100000) / 100000;
  }
  const N = 48;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  function noise2(x: number, y: number): number {
    x = ((x % N) + N) % N; y = ((y % N) + N) % N;
    const x0 = Math.floor(x) % N, y0 = Math.floor(y) % N;
    const x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const n00 = g[y0 * N + x0], n10 = g[y0 * N + x1];
    const n01 = g[y1 * N + x0], n11 = g[y1 * N + x1];
    const nx0 = n00 + (n10 - n00) * fx, nx1 = n01 + (n11 - n01) * fx;
    return nx0 + (nx1 - nx0) * fy;
  }
  function fbm2(x: number, y: number, oct = 4): number {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f); f *= 2.13; amp *= 0.55; }
    return v;
  }
  return { noise2, fbm2 };
}

export function genCraterTexture(w: number, h: number, baseHex: string, darkHex: string, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d')!;
  const base = hexToRgb(baseHex);
  const dark = hexToRgb(darkHex);
  const nz = makeNoise(seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 7, v = (y / h) * 3.5;
      const n = nz.fbm2(u, v, 5);
      const shade = 0.72 + n * 0.55;
      const i = (y * w + x) * 4;
      const m = (shade < 1) ? lerpColor(dark, base, shade) : base;
      img.data[i] = Math.max(0, Math.min(255, m[0]));
      img.data[i + 1] = Math.max(0, Math.min(255, m[1]));
      img.data[i + 2] = Math.max(0, Math.min(255, m[2]));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  let rs = ((seed * 9301) + 49297) % 233280;
  function rnd(): number { rs = ((rs * 9301) + 49297) % 233280; return rs / 233280; }
  const craterCount = Math.floor((w * h) / 1300);
  for (let i = 0; i < craterCount; i++) {
    const cx = rnd() * w, cy = rnd() * h;
    const r = 1.5 + rnd() * rnd() * w * 0.03;
    const grad = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, Math.max(0.5, r * 0.08), cx, cy, r);
    grad.addColorStop(0, `rgba(0,0,0,${0.30 + rnd() * 0.2})`);
    grad.addColorStop(0.72, 'rgba(0,0,0,0.04)');
    grad.addColorStop(0.85, `rgba(255,255,255,${0.08 + rnd() * 0.08})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.fillStyle = grad; ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  return cv;
}

export function genBandedTexture(
  w: number, h: number,
  stops: Array<{ t: number; c: [number, number, number] }>,
  seed: number,
  spot?: { u: number; v: number; rx: number; ry: number; color: string }
): HTMLCanvasElement {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d')!;
  const nz = makeNoise(seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = nz.fbm2(u * 2.6, v * 13.0 + seed * 0.017, 4) * 0.045;
      const vv = clamp01(v + warp);
      let c: [number, number, number] = [255, 255, 255];
      for (let k = 0; k < stops.length - 1; k++) {
        if (vv >= stops[k].t && vv <= stops[k + 1].t) {
          const lt = (vv - stops[k].t) / Math.max(0.0001, (stops[k + 1].t - stops[k].t));
          c = lerpColor(stops[k].c, stops[k + 1].c, lt);
          break;
        }
      }
      const grain = nz.fbm2(u * 11.0, v * 11.0 + 50, 3) * 9;
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, c[0] + grain));
      img.data[i + 1] = Math.max(0, Math.min(255, c[1] + grain));
      img.data[i + 2] = Math.max(0, Math.min(255, c[2] + grain));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (spot) {
    const cx = spot.u * w, cy = spot.v * h, rx = spot.rx * w, ry = spot.ry * h;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, spot.color); grad.addColorStop(0.68, spot.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  return cv;
}

export function genMarsTexture(w: number, h: number, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d')!;
  const nz = makeNoise(seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = nz.fbm2(u * 5.2, v * 5.2, 5);
      let c = lerpColor([146, 58, 26], [207, 112, 58], n * 0.5 + 0.5);
      const poleDist = Math.min(v, 1 - v);
      if (poleDist < 0.11) {
        const capT = 1 - poleDist / 0.11;
        const icy: [number, number, number] = [236, 233, 227];
        const patchy = 0.65 + 0.35 * Math.max(0, nz.fbm2(u * 9, v * 9, 3));
        c = lerpColor(c, icy, Math.min(1, capT * 1.25) * patchy);
      }
      const i = (y * w + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function genVenusTexture(w: number, h: number, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d')!;
  const nz = makeNoise(seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const warp = nz.fbm2(u * 2 + v * 2.4, v * 5.5, 4) * 0.16;
      const n = nz.fbm2(u * 3.6 + warp * 5, v * 9.0, 5);
      const c = lerpColor([198, 175, 120], [233, 218, 175], n * 0.5 + 0.5);
      const i = (y * w + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function genRingTexture(w: number, bands: Array<{ t: number; c: string }>): HTMLCanvasElement {
  const cv = makeCanvas(w, 8), ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  bands.forEach((b) => grad.addColorStop(b.t, b.c));
  ctx.clearRect(0, 0, w, 8);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, 8);
  return cv;
}

export function createRingGeometry(inner: number, outer: number, segs = 128): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const theta = (i / segs) * Math.PI * 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    positions.push(inner * cos, 0, inner * sin); uvs.push(0, i / segs);
    positions.push(outer * cos, 0, outer * sin); uvs.push(1, i / segs);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Build a procedural texture for any solar-system planet id */
export function buildPlanetTexture(planetId: string, seed: number): HTMLCanvasElement | null {
  if (planetId === 'mercury') return genCraterTexture(640, 320, '#9c9187', '#6b625b', seed);
  if (planetId === 'venus') return genVenusTexture(640, 320, seed);
  if (planetId === 'mars') return genMarsTexture(768, 384, seed);
  if (planetId === 'jupiter') {
    return genBandedTexture(896, 448, [
      { t: 0.0, c: [173, 140, 95] }, { t: 0.12, c: [214, 196, 160] }, { t: 0.22, c: [160, 110, 70] },
      { t: 0.33, c: [224, 208, 178] }, { t: 0.45, c: [186, 150, 105] }, { t: 0.5,  c: [214, 196, 160] },
      { t: 0.58, c: [168, 120, 80] }, { t: 0.7,  c: [221, 201, 168] }, { t: 0.82, c: [176, 140, 98] },
      { t: 1.0,  c: [201, 175, 140] }
    ], seed, { u: 0.34, v: 0.62, rx: 0.075, ry: 0.045, color: 'rgba(178,88,58,0.85)' });
  }
  if (planetId === 'saturn') {
    return genBandedTexture(896, 448, [
      { t: 0.0, c: [196, 175, 130] }, { t: 0.15, c: [224, 208, 172] }, { t: 0.3, c: [201, 182, 140] },
      { t: 0.45, c: [230, 216, 182] }, { t: 0.6, c: [206, 188, 148] }, { t: 0.75, c: [224, 208, 172] },
      { t: 1.0, c: [210, 193, 155] }
    ], seed);
  }
  if (planetId === 'uranus') {
    return genBandedTexture(896, 448, [
      { t: 0.0, c: [150, 205, 208] }, { t: 0.35, c: [178, 224, 226] },
      { t: 0.65, c: [168, 218, 220] }, { t: 1.0, c: [152, 206, 209] }
    ], seed);
  }
  if (planetId === 'neptune') {
    return genBandedTexture(896, 448, [
      { t: 0.0, c: [42, 72, 168] }, { t: 0.35, c: [64, 98, 196] },
      { t: 0.65, c: [54, 86, 184] }, { t: 1.0, c: [38, 66, 158] }
    ], seed, { u: 0.62, v: 0.4, rx: 0.05, ry: 0.032, color: 'rgba(20,35,80,0.6)' });
  }
  if (planetId === 'moon') return genCraterTexture(512, 256, '#a8a8a8', '#6c6c6c', seed);
  return null;
}

/** Saturn-style ring band palette (with Cassini Division) */
export const SATURN_RING_BANDS: Array<{ t: number; c: string }> = [
  { t: 0.0,  c: 'rgba(180,160,120,0.0)' },
  { t: 0.08, c: 'rgba(180,160,120,0.35)' },
  { t: 0.22, c: 'rgba(200,182,140,0.55)' },
  { t: 0.4,  c: 'rgba(214,198,158,0.8)' },
  { t: 0.52, c: 'rgba(214,198,158,0.15)' }, // Cassini Division
  { t: 0.56, c: 'rgba(190,172,130,0.75)' },
  { t: 0.78, c: 'rgba(224,210,172,0.85)' },
  { t: 0.9,  c: 'rgba(200,182,140,0.4)' },
  { t: 1.0,  c: 'rgba(180,160,120,0.0)' }
];