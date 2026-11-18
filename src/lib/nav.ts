import { DISTRICTS, ISLAND, WORLD_FULL } from '@/game/data/districts';

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
/** Place names drawn on the minimap / full map. */
export interface NavLabel { x: number; z: number; text: string; kind: 'district' | 'poi' | 'street' | 'camp'; color?: string; district?: number }
export interface NavTarget { x: number; z: number; color: string; label: string }

export const nav = {
  rects: [] as NavRect[],
  markers: [] as NavMarker[],
  labels: [] as NavLabel[],
  sea: false,   // island maps: water background
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
  nav.rects = []; nav.markers = []; nav.labels = []; nav.sea = false; nav.target = null; nav.route = null; nav.routeMode = 'street';
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

/** Names for the original four districts + every landmark; `outer` adds the outer-city streets, ring roads and park. */
export function cityLabels(outer: boolean): NavLabel[] {
  const out: NavLabel[] = [];
  for (const d of DISTRICTS) {
    out.push({ x: d.cx, z: -20, text: d.name, kind: 'district', district: d.id });
    for (const l of d.landmarks) out.push({ x: l.pos[0], z: l.pos[1] + (l.pos[1] < 0 ? -(l.size[2] / 2 + 3) : l.size[2] / 2 + 3), text: l.label, kind: 'poi', color: l.neon, district: d.id });
  }
  out.push({ x: -40, z: 6, text: 'MAIN STREET', kind: 'street' });
  if (outer) {
    const st: [number, number, string][] = [
      [30, -215, 'NORTH RING AVENUE'], [30, -150, 'UPTOWN AVENUE'], [30, -100, 'NORTH AVENUE'],
      [30, 100, 'SOUTH AVENUE'], [30, 150, 'HARBOUR AVENUE'], [30, 215, 'SOUTH RING AVENUE'],
      [-115, -60, 'WEST RING ROAD'], [415, -60, 'EAST RING ROAD'],
      [50, 125, 'MARKET CROSS ST'], [150, 125, 'NEON CROSS ST'], [250, 125, 'PORT CROSS ST'], [350, 125, 'FINANCE CROSS ST'],
    ];
    for (const [x, z, text] of st) out.push({ x, z, text, kind: 'street' });
    for (const s of [-1, 1]) out.push({ x: 200, z: s * 182.5, text: s < 0 ? 'NORTH PARK' : 'CENTRAL PARK', kind: 'poi', color: '#39ff88' });
    for (const [x, z, t] of [[150, -ISLAND.halfZ + 12, 'NORTH BEACH'], [150, ISLAND.halfZ - 12, 'SOUTH BEACH'], [ISLAND.maxX - 14, 0, 'EAST BEACH'], [ISLAND.minX + 14, 0, 'WEST BEACH']] as [number, number, string][]) out.push({ x, z, text: t, kind: 'district', color: '#ffe9a8' });
    out.push({ x: -80, z: 60, text: 'OLD TOWN', kind: 'district' }, { x: 400, z: 60, text: 'HARBOUR QUARTER', kind: 'district' },
      { x: 100, z: -130, text: 'UPTOWN', kind: 'district' }, { x: 300, z: 130, text: 'DOWNTOWN', kind: 'district' },
      { x: 100, z: 185, text: 'SOUTHSIDE', kind: 'district' }, { x: 320, z: -185, text: 'SKYLINE HEIGHTS', kind: 'district' });
  }
  return out;
}

/** Shared label painter. mode 'full' draws everything; 'mini' only what the radar can fit. */
export function drawLabel(x: CanvasRenderingContext2D, l: NavLabel, sx: number, sy: number, k: number, mini: boolean, dim: boolean) {
  const big = l.kind === 'district';
  if (mini && (l.kind === 'street' || l.kind === 'camp')) return;
  const size = mini ? (big ? 9 : 8) : big ? Math.max(11, Math.min(15, 160 * k * 0.1)) : l.kind === 'street' ? 9 : 10;
  x.save();
  x.globalAlpha = dim ? 0.35 : 1;
  x.font = `${big ? 900 : 700} ${size}px Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineJoin = 'round';
  x.fillStyle = l.kind === 'street' ? '#9aa0b8' : l.color ?? (big ? '#ffffff' : l.kind === 'camp' ? '#ff6b86' : '#ffe08a');
  x.strokeText(l.text, sx, sy); x.fillText(l.text, sx, sy);
  x.restore();
}

/** Sand ring + city ground, drawn first so roads sit on top. For the island (open) modes. */
export function islandRects(): NavRect[] {
  const w = ISLAND.maxX - ISLAND.minX, cx = (ISLAND.minX + ISLAND.maxX) / 2;
  return [
    { x: cx, z: 0, w, d: ISLAND.halfZ * 2, color: '#cdb784' },
    { x: (WORLD_FULL.minX + WORLD_FULL.maxX) / 2, z: 0, w: WORLD_FULL.maxX - WORLD_FULL.minX, d: WORLD_FULL.halfZ * 2, color: '#262838' },
  ];
}
