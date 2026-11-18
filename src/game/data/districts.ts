import { DISTRICT_UNLOCK } from '@/lib/PriceSystem';

export interface Landmark {
  id: string;
  label: string;
  pos: [number, number]; // x, z (z<0 = north side, door faces +z)
  size: [number, number, number];
  color: string;
  neon: string;
  kind?: 'tower' | 'bridge';
}
export type DistrictStyle = 'market' | 'london' | 'portharcourt' | 'finance';
export interface DistrictDef {
  id: 1 | 2 | 3 | 4;
  name: string;
  tagline: string;
  style: DistrictStyle;
  cx: number;
  unlockPrice: number;
  palette: string[];
  heightWeights: [number, number, number, number]; // odds for 9m/16m/28m/44m buildings
  landmarks: Landmark[];
}

/** Four districts laid out west -> east along one main street (z = 0). 100m each. */
export const DISTRICTS: DistrictDef[] = [
  {
    id: 1, name: 'LAGOS MARKET', tagline: 'Pawn Shop · Chicken Shop', style: 'market', cx: 0,
    unlockPrice: DISTRICT_UNLOCK[1], palette: ['#4a2f3a', '#3b3550', '#5a3a2a', '#2f4a45'],
    heightWeights: [0.55, 0.35, 0.1, 0],
    landmarks: [
      { id: 'pawn', label: 'PAWN SHOP', pos: [-24, -16], size: [12, 6, 9], color: '#6b4f2a', neon: '#ffd23f' },
      { id: 'chicken', label: 'FAP CHICKEN', pos: [22, -16], size: [11, 5, 9], color: '#8a2a2a', neon: '#ff5a36' },
    ],
  },
  {
    id: 2, name: 'LONDON NEON', tagline: 'Penthouse · Cyber Cafe', style: 'london', cx: 100,
    unlockPrice: DISTRICT_UNLOCK[2], palette: ['#2a2f4a', '#3a2a50', '#1f3a4a', '#40304a'],
    heightWeights: [0.2, 0.45, 0.35, 0],
    landmarks: [
      { id: 'penthouse', label: 'POL PENTHOUSE', pos: [94, -16], size: [10, 32, 10], color: '#3b2a52', neon: '#ff4fd8', kind: 'tower' },
      { id: 'cyber', label: 'CYBER CAFE', pos: [126, 16], size: [13, 6, 9], color: '#143a4a', neon: '#22d3ee' },
    ],
  },
  {
    id: 3, name: 'PORT HARCOURT', tagline: 'Toilet Alley · Gym Under Bridge · Hackspace', style: 'portharcourt', cx: 200,
    unlockPrice: DISTRICT_UNLOCK[3], palette: ['#4a3a2a', '#3a4538', '#52402f', '#33353d'],
    heightWeights: [0.6, 0.35, 0.05, 0],
    landmarks: [
      { id: 'toilet', label: 'TOILET ALLEY', pos: [176, 16], size: [8, 5, 8], color: '#3a4a3a', neon: '#a3e635' },
      { id: 'gym', label: 'GYM UNDER BRIDGE', pos: [206, -16], size: [12, 5, 9], color: '#4a2a2a', neon: '#f59e0b', kind: 'bridge' },
      { id: 'hackspace', label: 'HACKSPACE', pos: [236, 16], size: [11, 6, 9], color: '#12301f', neon: '#39ff88' },
      { id: 'callcenter', label: 'AI CALL CENTER', pos: [240, -16], size: [14, 9, 9], color: '#2a2a3a', neon: '#ff2d55' },
    ],
  },
  {
    id: 4, name: 'FAP FINANCE', tagline: 'Rugged Pub · Exchange · Highway · Rooftop', style: 'finance', cx: 300,
    unlockPrice: DISTRICT_UNLOCK[4], palette: ['#1f2a44', '#24324f', '#2b2748', '#1b3a44'],
    heightWeights: [0.05, 0.25, 0.4, 0.3],
    landmarks: [
      { id: 'pub', label: 'RUGGED PUB', pos: [275, -16], size: [13, 6, 10], color: '#3a1218', neon: '#ff2d55' },
      { id: 'bridgeex', label: 'BRIDGE UNDER EXCHANGE', pos: [310, 16], size: [10, 4, 10], color: '#24242c', neon: '#9be7ff' },
      { id: 'exchange', label: 'LONDON EXCHANGE', pos: [345, -18], size: [14, 40, 12], color: '#1d2b46', neon: '#ffd23f', kind: 'tower' },
      { id: 'rooftop', label: 'ROOFTOP FINAL', pos: [322, -18], size: [10, 48, 10], color: '#181c30', neon: '#ff4fd8', kind: 'tower' },
    ],
  },
];

export const WORLD = { minX: -55, maxX: 355, halfZ: 92 };

/** The full open-mode city (Survival / Free Play): original strip + ring road, 2 extra avenues each side, cross streets, park. */
export const WORLD_FULL = { minX: -135, maxX: 435, halfZ: 230 };
/** The island: the city plus a 30 m beach on every side; the shoreline is where you stop. */
export const BEACH = 30;
export const ISLAND = { minX: WORLD_FULL.minX - BEACH, maxX: WORLD_FULL.maxX + BEACH, halfZ: WORLD_FULL.halfZ + BEACH };
export const PLAZAS: [number, number][] = [[100, -125], [300, -125], [100, 125], [300, 125]];
export const AVENUES_Z = [-215, -150, -100, 100, 150, 215];
export const CROSS_X = [50, 150, 250, 350];
export const RING_X = [-115, 415];
export const PARK = { minX: 162, maxX: 238, z0: 161, z1: 204 };

/**
 * Level 1 side routes. Each one leaves the main street through a gap in the building front (x = sx), runs along a
 * side street to building row `row`, then turns into an alley that runs to x = ax. Both sx and ax are building-column
 * centres of the district (cx - 45 + 10 * i). Quest givers wait at the end of these routes.
 */
export interface SideRoute { id: string; district: 1 | 2 | 3 | 4; sx: number; dir: -1 | 1; row: number; ax: number }
export const ROUTES: SideRoute[] = [
  { id: 'brandon', district: 1, sx: -25, dir: -1, row: 2, ax: 25 },
  { id: 'pol', district: 2, sx: 85, dir: 1, row: 3, ax: 125 },
  { id: 'robofap', district: 2, sx: 135, dir: -1, row: 4, ax: 105 },
  { id: 'paperhands', district: 3, sx: 165, dir: 1, row: 4, ax: 205 },
  { id: 'meast', district: 3, sx: 235, dir: -1, row: 3, ax: 195 },
];
export const rowZ = (row: number, dir: number) => dir * (28 + row * 10);
export const BUILDING_ROWS = 6;

/** True when (x,z) is on a road or its kerb (main street, avenues, cross streets, ring roads). Keeps trees/props off the carriageway. */
export function onRoad(x: number, z: number, pad = 0): boolean {
  if (Math.abs(z) < 8 + pad) return true;
  if (AVENUES_Z.some((a) => Math.abs(z - a) < 7 + pad)) return true;
  if (Math.abs(z) > 93 - pad && CROSS_X.some((c) => Math.abs(x - c) < 6 + pad)) return true;
  if (RING_X.some((r) => Math.abs(x - r) < 7 + pad)) return true;
  return false;
}
