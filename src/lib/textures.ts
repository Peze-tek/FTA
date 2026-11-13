/**
 * Procedural PBR-ish textures (canvas generated once, cached). No image assets: keeps the bundle tiny.
 * Colour maps are sRGB; bump maps are linear greyscale.
 */
import * as THREE from 'three';
import { rng } from '@/lib/rng';

type Draw = (x: CanvasRenderingContext2D, w: number, h: number) => void;
const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, draw: Draw, o: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 4;
  cache.set(key, t);
  return t;
}

/** Per-pixel brightness noise. */
function grain(x: CanvasRenderingContext2D, w: number, h: number, amp: number, seed: number) {
  const r = rng(seed), img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}
function blotches(x: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number, rgb: string, a: number, rMin: number, rMax: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = r() * h, rad = rMin + r() * (rMax - rMin);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(${rgb},${a * (0.4 + r() * 0.6)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

/** City street, tile = 14 m (u, along the street) x 16 m (v, across): wheel tracks, patches, cracks + lane paint. */
export function cityRoadTexture() {
  return make('cityRoad', 512, 512, (x, w, h) => {
    x.fillStyle = '#3b3c41'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 26, 5, '20,20,24', 0.35, 20, 70);
    blotches(x, w, h, 14, 6, '80,80,86', 0.18, 20, 60);
    // wheel tracks (darker, polished) in both lanes
    for (const lane of [0.25, 0.75]) for (const o of [-0.075, 0.075]) {
      const g = x.createLinearGradient(0, (lane + o - 0.03) * h, 0, (lane + o + 0.03) * h);
      g.addColorStop(0, 'rgba(10,10,14,0)'); g.addColorStop(0.5, 'rgba(10,10,14,0.38)'); g.addColorStop(1, 'rgba(10,10,14,0)');
      x.fillStyle = g; x.fillRect(0, (lane + o - 0.03) * h, w, 0.06 * h);
    }
    grain(x, w, h, 26, 11);
    // cracks
    const r = rng(21);
    x.strokeStyle = 'rgba(12,12,14,0.55)'; x.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 7; k++) { px += (r() - 0.35) * 34; py += (r() - 0.5) * 26; x.lineTo(px, py); }
      x.stroke();
    }
    // lane paint (worn): centre double yellow, dashed white lane lines, solid white edges
    x.globalAlpha = 0.9;
    x.fillStyle = '#d9b730'; x.fillRect(0, h * 0.5 - 7, w, 3.2); x.fillRect(0, h * 0.5 + 3.8, w, 3.2);
    x.fillStyle = '#e8e8e4';
    for (const v of [0.25, 0.75]) x.fillRect(w * 0.08, h * v - 2, w * 0.36, 4);
    x.fillRect(0, h * 0.018, w, 4.5); x.fillRect(0, h * 0.982 - 4.5, w, 4.5);
    x.globalAlpha = 1;
    // paint wear
    const img = x.getImageData(0, 0, w, h), d = img.data, rr = rng(31);
    for (let i = 0; i < d.length; i += 4) if (rr() < 0.05) { d[i] *= 0.82; d[i + 1] *= 0.82; d[i + 2] *= 0.82; }
    x.putImageData(img, 0, 0);
  }, { aniso: 8 });
}

/** Highway asphalt for the race: u across the road (18.4 m), v along (tile 14 m). Wheel tracks per lane, no paint. */
export function highwayTexture() {
  return make('highway', 512, 512, (x, w, h) => {
    x.fillStyle = '#3a3b40'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 24, 7, '18,18,22', 0.32, 24, 80);
    blotches(x, w, h, 12, 8, '90,90,96', 0.14, 24, 60);
    for (const lane of [0.25, 0.5, 0.75]) for (const o of [-0.05, 0.05]) {
      const g = x.createLinearGradient((lane + o - 0.025) * w, 0, (lane + o + 0.025) * w, 0);
      g.addColorStop(0, 'rgba(10,10,14,0)'); g.addColorStop(0.5, 'rgba(10,10,14,0.4)'); g.addColorStop(1, 'rgba(10,10,14,0)');
      x.fillStyle = g; x.fillRect((lane + o - 0.025) * w, 0, 0.05 * w, h);
    }
    grain(x, w, h, 28, 12);
    const r = rng(22);
    x.strokeStyle = 'rgba(12,12,14,0.5)'; x.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 26; py += (r() - 0.35) * 34; x.lineTo(px, py); }
      x.stroke();
    }
  }, { aniso: 8 });
}

/** Paving slabs (tile ~ 4 m). */
export function pavingTexture() {
  return make('paving', 256, 256, (x, w, h) => {
    x.fillStyle = '#a3a19b'; x.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 150 + Math.floor(r() * 26);
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    blotches(x, w, h, 12, 4, '70,66,58', 0.22, 12, 44);
    grain(x, w, h, 22, 5);
    x.strokeStyle = 'rgba(40,38,34,0.7)'; x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); }
  });
}

export function grassTexture() {
  return make('grass', 256, 256, (x, w, h) => {
    x.fillStyle = '#5b7f34'; x.fillRect(0, 0, w, h);
    blotches(x, w, h, 40, 9, '70,110,40', 0.45, 14, 50);
    blotches(x, w, h, 26, 10, '120,130,60', 0.3, 12, 40);
    blotches(x, w, h, 16, 11, '40,70,28', 0.4, 10, 30);
    grain(x, w, h, 38, 12);
    const r = rng(13);
    for (let i = 0; i < 900; i++) {
      const px = r() * w, py = r() * h;
      x.strokeStyle = `rgba(${40 + r() * 70},${90 + r() * 70},${30 + r() * 30},0.5)`; x.lineWidth = 1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 4); x.stroke();
    }
  });
}

/** White zebra bars: bars run along u (traffic direction), stacked along v. */
export function crosswalkTexture() {
  return make('crosswalk', 128, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const r = rng(14);
    for (let i = 0; i < 12; i++) {
      x.fillStyle = `rgba(236,236,230,${0.82 + r() * 0.15})`;
      x.fillRect(6, i * (h / 12) + 6, w - 12, h / 12 - 22);
    }
    const img = x.getImageData(0, 0, w, h), d = img.data, rr = rng(15);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && rr() < 0.12) d[i + 3] *= 0.55;
    x.putImageData(img, 0, 0);
  }, { srgb: true, repeat: false });
}

/* --------------------------------------------------------------- building facades */
export interface FacadeSet { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; emissive: THREE.CanvasTexture }
const facades = new Map<number, FacadeSet>();

function skyPane(x: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number, tint: number) {
  const g = x.createLinearGradient(0, py, 0, py + ph);
  const k = tint * 18;
  g.addColorStop(0, `rgb(${150 + k},${196 + k},${236})`);
  g.addColorStop(0.55, `rgb(${70 + k},${112 + k},${156})`);
  g.addColorStop(1, `rgb(${28},${44 + k},${68})`);
  x.fillStyle = g; x.fillRect(px, py, pw, ph);
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.beginPath();
  x.moveTo(px + pw * 0.15, py); x.lineTo(px + pw * 0.5, py); x.lineTo(px + pw * 0.05, py + ph); x.lineTo(px, py + ph * 0.9); x.closePath(); x.fill();
}

/** class 0..3: plaster shopfront, brick block, ribbon-window office, glass curtain wall. Tile = 8 m x 9.6 m (4 x 3 windows). */
export function facadeSet(cls: number): FacadeSet {
  const hit = facades.get(cls);
  if (hit) return hit;
  const S = 256, cw = S / 4, ch = S / 3, r = rng(100 + cls);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cc = mk(), bc = mk(), ec = mk();
  const x = cc.getContext('2d')!, b = bc.getContext('2d')!, e = ec.getContext('2d')!;
  const wall = ['#e9ded0', '#cdb9a5', '#cdd5de', '#b4c3d3'][cls];
  x.fillStyle = wall; x.fillRect(0, 0, S, S);
  b.fillStyle = 'rgb(140,140,140)'; b.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  if (cls === 0 || cls === 1) {
    blotches(x, S, S, 14, 40 + cls, '90,70,50', 0.18, 10, 40);
    if (cls === 1) {   // brick courses
      x.strokeStyle = 'rgba(70,40,30,0.28)'; x.lineWidth = 1;
      for (let y = 0; y < S; y += 6) { x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke(); }
      for (let y = 0, row = 0; y < S; y += 6, row++) for (let xx = (row % 2) * 8; xx < S; xx += 16) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 6); x.stroke(); }
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const px = i * cw + 11, py = j * ch + 13, pw = cw - 22, ph = ch - 30;
      x.fillStyle = '#f5f1e8'; x.fillRect(px - 3, py - 3, pw + 6, ph + 6);      // frame
      skyPane(x, px, py, pw, ph, Math.floor(r() * 3));
      x.fillStyle = '#f5f1e8'; x.fillRect(px + pw / 2 - 1, py, 2, ph);          // mullion
      x.fillStyle = '#b9b2a4'; x.fillRect(px - 5, py + ph + 3, pw + 10, 4);     // sill
      if (r() < 0.18) { x.fillStyle = '#d4d6d8'; x.fillRect(px + 2, py + ph + 6, pw - 4, 9); x.fillStyle = '#9aa0a6'; x.fillRect(px + 4, py + ph + 8, pw - 8, 2); } // AC unit
      b.fillStyle = 'rgb(60,60,60)'; b.fillRect(px, py, pw, ph);
      b.fillStyle = 'rgb(210,210,210)'; b.fillRect(px - 3, py - 3, pw + 6, 3); b.fillRect(px - 5, py + ph + 3, pw + 10, 4);
      if (r() < 0.38) { e.fillStyle = r() < 0.7 ? '#ffd9a0' : '#bfe6ff'; e.fillRect(px + 1, py + 1, pw - 2, ph - 2); }
    }
  } else {
    for (let j = 0; j < 3; j++) {
      const py = j * ch + 4, ph = ch - 14;
      x.fillStyle = cls === 2 ? '#aab3bd' : '#8d99a6'; x.fillRect(0, j * ch, S, ch);   // spandrel
      for (let i = 0; i < 8; i++) {
        const pw = S / 8;
        skyPane(x, i * pw + 1, py, pw - 2, ph, Math.floor(r() * 3));
        b.fillStyle = 'rgb(70,70,70)'; b.fillRect(i * pw + 1, py, pw - 2, ph);
        if (r() < (cls === 2 ? 0.3 : 0.22)) { e.fillStyle = r() < 0.75 ? '#ffe2b0' : '#cfeaff'; e.fillRect(i * pw + 2, py + 1, pw - 4, ph - 2); }
      }
      x.fillStyle = '#7f8b98'; x.fillRect(0, j * ch + ch - 10, S, 3);
      b.fillStyle = 'rgb(205,205,205)'; b.fillRect(0, j * ch + ch - 10, S, 3);
    }
  }
  grain(x, S, S, 14, 60 + cls);
  const wrap = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = { map: wrap(cc, true), bump: wrap(bc, false), emissive: wrap(ec, true) };
  facades.set(cls, set);
  return set;
}

/** Corrugated shop shutter / door strip, painted steel look (for landmark storefronts). */
export function shutterTexture() {
  return make('shutter', 128, 128, (x, w, h) => {
    x.fillStyle = '#6f7378'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { x.fillStyle = y % 12 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.2)'; x.fillRect(0, y, w, 3); }
    grain(x, w, h, 20, 70);
  });
}
