/** Merged low-poly geometries (vertex-coloured) for trees, palms, bushes and parked cars: one draw call per instanced set. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function prep(g: THREE.BufferGeometry, hex: string | ((x: number, y: number, z: number) => THREE.Color), m?: THREE.Matrix4) {
  let o = g.index ? g.toNonIndexed() : g;
  if (m) o.applyMatrix4(m);
  o.deleteAttribute('uv');
  o.computeVertexNormals();
  const pos = o.getAttribute('position'), col = new Float32Array(pos.count * 3), base = typeof hex === 'string' ? new THREE.Color(hex) : null;
  for (let i = 0; i < pos.count; i++) {
    const c = base ?? (hex as (x: number, y: number, z: number) => THREE.Color)(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  o.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return o;
}
const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

function frond(len: number, width: number, segs = 6): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c0 = new THREE.Color('#2a5a28'), c1 = new THREE.Color('#78b043'), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = t * len, y = Math.sin(t * 1.4) * 0.85 - t * t * 1.7;
    const w = width * Math.sin(Math.PI * (0.1 + 0.9 * t)) * (1 - 0.2 * t) * 0.5 + 0.02;
    pos.push(x, y, -w, x, y + 0.04, w);
    c.copy(c0).lerp(c1, t); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const n = g.toNonIndexed(); n.computeVertexNormals();
  return n;
}

let palm: THREE.BufferGeometry | null = null;
export function getPalmGeo() {
  if (palm) return palm;
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.17, 0.32, 7.8, 7, 3, true);
  parts.push(prep(trunk, (_x, y) => new THREE.Color('#6a4f35').lerp(new THREE.Color('#9a7c58'), Math.max(0, Math.min(1, y / 7.8))), T(0, 3.9, 0, 0, 0, 0.04)));
  parts.push(prep(new THREE.IcosahedronGeometry(0.32, 0), '#5a4430', T(0.27, 7.85, 0)));   // crown knot
  const N = 11;
  for (let i = 0; i < N; i++) {
    const f = frond(3.5 + (i % 3) * 0.35, 0.95);
    const m = T(0.28, 7.8, 0, 0, (i / N) * Math.PI * 2 + 0.3, (i % 2 ? 0.34 : 0.1) - 0.12);
    f.applyMatrix4(m);
    parts.push(f);
  }
  palm = mergeGeometries(parts, false)!;
  return palm;
}

let tree: THREE.BufferGeometry | null = null;
export function getTreeGeo() {
  if (tree) return tree;
  const g = (r: number, hex: string, x: number, y: number, z: number) =>
    prep(new THREE.IcosahedronGeometry(r, 1), (px, py, pz) => new THREE.Color(hex).multiplyScalar(0.8 + 0.35 * Math.max(0, Math.min(1, (py - (y - r)) / (2 * r)))), T(x, y, z));
  tree = mergeGeometries([
    prep(new THREE.CylinderGeometry(0.22, 0.38, 3.8, 6), '#5d4630', T(0, 1.9, 0)),
    g(2.2, '#3f7d35', 0, 5.3, 0), g(1.6, '#4f9040', 1.2, 4.5, 0.5), g(1.5, '#37702f', -1.1, 4.7, -0.6), g(1.3, '#5a9a45', 0.2, 6.5, -0.2),
  ], false)!;
  return tree;
}

let bush: THREE.BufferGeometry | null = null;
export function getBushGeo() {
  if (bush) return bush;
  bush = mergeGeometries([
    prep(new THREE.IcosahedronGeometry(0.75, 1), '#3d7a34', T(0, 0.55, 0)),
    prep(new THREE.IcosahedronGeometry(0.55, 1), '#4c8c3c', T(0.6, 0.4, 0.2)),
    prep(new THREE.IcosahedronGeometry(0.5, 1), '#356b2d', T(-0.55, 0.38, -0.15)),
  ], false)!;
  return bush;
}

/** Parked sedan. Nose = +Z. Body vertex colour is white so the per-instance colour is the paint. */
let car: THREE.BufferGeometry | null = null;
export function getCarGeo() {
  if (car) return car;
  const box = (w: number, h: number, d: number, hex: string, x: number, y: number, z: number) => prep(new THREE.BoxGeometry(w, h, d), hex, T(x, y, z));
  const wheel = (x: number, z: number) => prep(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10), '#141416', T(x, 0.34, z, 0, 0, Math.PI / 2));
  car = mergeGeometries([
    box(1.8, 0.5, 4.4, '#ffffff', 0, 0.56, 0),
    box(1.74, 0.16, 1.3, '#ffffff', 0, 0.86, 1.4),        // hood
    box(1.5, 0.5, 2.15, '#f4f4f4', 0, 1.06, -0.25),       // cabin
    box(1.54, 0.36, 2.0, '#1d2a38', 0, 1.06, -0.25),      // glass band
    box(1.2, 0.08, 1.9, '#f4f4f4', 0, 1.32, -0.25),       // roof
    box(1.7, 0.18, 0.12, '#222225', 0, 0.36, 2.2),        // bumpers
    box(1.7, 0.18, 0.12, '#222225', 0, 0.36, -2.2),
    box(0.4, 0.1, 0.05, '#fff3c0', 0.6, 0.62, 2.2), box(0.4, 0.1, 0.05, '#fff3c0', -0.6, 0.62, 2.2),
    box(0.4, 0.1, 0.05, '#c1121f', 0.6, 0.66, -2.21), box(0.4, 0.1, 0.05, '#c1121f', -0.6, 0.66, -2.21),
    wheel(0.9, 1.4), wheel(-0.9, 1.4), wheel(0.9, -1.4), wheel(-0.9, -1.4),
  ], false)!;
  return car;
}
