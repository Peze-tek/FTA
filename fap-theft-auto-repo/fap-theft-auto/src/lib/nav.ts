/**
 * Shared, non-reactive navigation data for the minimap.
 * Level scenes fill it (static rects once, markers/target as things change); <MiniMap/> just draws it.
 */
export interface NavRect {
  x: number; z: number; w: number; d: number; color: string;
  district?: number;      // dimmed while that district is locked
  lockedOnly?: boolean;   // only drawn while the district is locked (barricades)
}
export interface NavMarker { x: number; z: number; color: string; kind: 'poi' | 'enemy' }
export interface NavTarget { x: number; z: number; color: string; label: string }

export const nav = {
  rects: [] as NavRect[],
  markers: [] as NavMarker[],
  target: null as NavTarget | null,
  range: 55, // metres from the player to the map edge
  /** 'street': straight street route (city). 'path': follow nav.route (maze). */
  routeMode: 'street' as 'street' | 'path',
  route: null as { x: number; z: number }[] | null,
};

const _t: NavTarget = { x: 0, z: 0, color: '#fff', label: '' };
/** Allocation-free target update (safe to call every frame). */
export function setNavTarget(x: number, z: number, color: string, label: string) {
  _t.x = x; _t.z = z; _t.color = color; _t.label = label;
  nav.target = _t;
}
export function clearNav() {
  nav.rects = []; nav.markers = []; nav.target = null; nav.route = null; nav.routeMode = 'street';
}

/** BFS over a tile map ('#' walls, 'C' cages and 'T' block unless they are the goal) -> world-space waypoints. */
export function tileRoute(tiles: string[], ts: number, from: { x: number; z: number }, to: { x: number; z: number }) {
  const H = tiles.length, W = tiles[0].length;
  const sx = Math.max(0, Math.min(W - 1, Math.round(from.x / ts)));
  const sz = Math.max(0, Math.min(H - 1, Math.round(from.z / ts)));
  const gx = Math.round(to.x / ts), gz = Math.round(to.z / ts);
  const prev = new Int32Array(W * H).fill(-2);
  const q: number[] = [sz * W + sx];
  prev[sz * W + sx] = -1;
  let found = false;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const cx = cur % W, cz = (cur / W) | 0;
    if (cx === gx && cz === gz) { found = true; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const ch = tiles[nz][nx];
      const goal = nx === gx && nz === gz;
      if ((ch === '#' || ch === 'C' || ch === 'T') && !goal) continue;
      const k = nz * W + nx;
      if (prev[k] !== -2) continue;
      prev[k] = cur; q.push(k);
    }
  }
  if (!found) return null;
  const out: { x: number; z: number }[] = [];
  for (let k = gz * W + gx; k !== -1; k = prev[k]) out.push({ x: (k % W) * ts, z: ((k / W) | 0) * ts });
  return out.reverse();
}
