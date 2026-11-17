/** Tiny 2D (XZ) AABB collision world. Districts register/unregister their boxes as they stream. */
export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }

const sets = new Map<string, AABB[]>();
const CELL = 24;
let grid = new Map<number, AABB[]>();
const key = (ix: number, iz: number) => (ix + 2048) * 4096 + (iz + 2048);

/** Spatial hash: a circle only tests the boxes in the cells it touches instead of every box in the city. */
function rebuild() {
  const g = new Map<number, AABB[]>();
  sets.forEach((v) => {
    for (let i = 0; i < v.length; i++) {
      const b = v[i];
      const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL), z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = key(ix, iz); const a = g.get(k); if (a) a.push(b); else g.set(k, [b]); }
    }
  });
  grid = g;
}

export function registerColliders(id: string, boxes: AABB[]) {
  sets.set(id, boxes);
  rebuild();
  return () => { if (sets.get(id) === boxes) { sets.delete(id); rebuild(); } };
}

export const boxFromCenter = (cx: number, cz: number, w: number, d: number): AABB => ({
  minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
});

/** Push a circle (x,z,r) out of every overlapping box. Mutates pos. */
export function resolveCircle(pos: { x: number; z: number }, r: number) {
  const x0 = Math.floor((pos.x - r) / CELL), x1 = Math.floor((pos.x + r) / CELL), z0 = Math.floor((pos.z - r) / CELL), z1 = Math.floor((pos.z + r) / CELL);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const cell = grid.get(key(ix, iz)); if (!cell) continue;
    for (let i = 0; i < cell.length; i++) {
    const b = cell[i];
    if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    } else {
      // centre is inside the box: exit through the nearest face
      const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) pos.x = b.minX - r;
      else if (m === rr) pos.x = b.maxX + r;
      else if (m === t) pos.z = b.minZ - r;
      else pos.z = b.maxZ + r;
    }
    }
  }
}

/* ------------------------------------------------------------------ ray / bullet blocking */
/** Oriented box for things that move (cars). Providers are asked for the current boxes on every ray test. */
export interface OBB { x: number; z: number; yaw: number; hw: number; hl: number }
const dyn = new Set<() => readonly OBB[]>();
export function registerDynamic(fn: () => readonly OBB[]) { dyn.add(fn); return () => { dyn.delete(fn); }; }

function slab(o: number, d: number, lo: number, hi: number, t: { a: number; b: number }) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let t1 = (lo - o) / d, t2 = (hi - o) / d;
  if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
  if (t1 > t.a) t.a = t1;
  if (t2 < t.b) t.b = t2;
  return t.a <= t.b;
}
const _t = { a: 0, b: 0 }, _seen = new Set<AABB>();
/** Distance along the (unit) ray (ox,oz)+(dx,dz)*t to the first building / prop / car, or maxD if the way is clear. */
export function rayObstacle(ox: number, oz: number, dx: number, dz: number, maxD: number): number {
  let best = maxD;
  _seen.clear();
  const n = Math.ceil(maxD / (CELL * 0.25));
  for (let i = 0; i <= n; i++) {
    const d = Math.min(maxD, i * CELL * 0.25), cx = Math.floor((ox + dx * d) / CELL), cz = Math.floor((oz + dz * d) / CELL);
    const cell = grid.get(key(cx, cz));
    if (!cell) continue;
    for (let k = 0; k < cell.length; k++) {
      const b = cell[k];
      if (_seen.has(b)) continue;
      _seen.add(b);
      _t.a = 0; _t.b = best;
      if (slab(ox, dx, b.minX, b.maxX, _t) && slab(oz, dz, b.minZ, b.maxZ, _t) && _t.a < best) best = _t.a;
    }
  }
  dyn.forEach((fn) => {
    for (const c of fn()) {
      const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const px = ox - c.x, pz = oz - c.z;
      const lox = px * co - pz * si, loz = px * si + pz * co, ldx = dx * co - dz * si, ldz = dx * si + dz * co;
      _t.a = 0; _t.b = best;
      if (slab(lox, ldx, -c.hw, c.hw, _t) && slab(loz, ldz, -c.hl, c.hl, _t) && _t.a < best) best = _t.a;
    }
  });
  return best;
}
/** True when something solid sits between the two points. */
export function losBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
  if (d < 0.5) return false;
  return rayObstacle(x0, z0, dx / d, dz / d, d - 0.4) < d - 0.45;
}
