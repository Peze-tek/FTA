/** Day / night clock: 1 real minute = 1 game hour (a full day lasts 24 real minutes). */
import * as THREE from 'three';
import { ATMO, type AtmoDef } from '@/lib/atmo';

export const HOURS_PER_SECOND = 1 / 60;
export const dayClock = { hour: 17.0 };            // every run starts in the golden hour
export function tickClock(dt: number) { dayClock.hour = (dayClock.hour + dt * HOURS_PER_SECOND) % 24; }
export function fmtClock(h: number) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export const isNight = (h: number) => h >= 19.6 || h < 5.4;
export const dayPart = (h: number) => (h >= 5 && h < 7.5 ? 'DAWN' : h >= 7.5 && h < 17 ? 'DAY' : h >= 17 && h < 19.6 ? 'DUSK' : 'NIGHT');

const DAWN: AtmoDef = {
  top: '#35508f', mid: '#d58aa0', horizon: '#ffb98a', sunColor: '#ffa366', sunDir: [0.8, 0.2, -0.45], clouds: 0.5,
  cloudLit: '#ffc9a8', cloudShade: '#8a6f9a', stars: false,
  fog: '#d9a58f', fogDensity: 0.0105, hemiSky: '#a7b3e0', hemiGround: '#5f4a42', hemi: 0.85, sun: 2.2, sunLight: '#ffa070', exposure: 1.0, env: 0.4,
};
const DUSK: AtmoDef = {
  top: '#1c2352', mid: '#7a3f7f', horizon: '#ff7b54', sunColor: '#ff7a4a', sunDir: [-0.8, 0.2, -0.45], clouds: 0.5,
  cloudLit: '#ff9a7a', cloudShade: '#4a2e6a', stars: false,
  fog: '#a55a6e', fogDensity: 0.0125, hemiSky: '#8a77c4', hemiGround: '#40283a', hemi: 0.8, sun: 1.1, sunLight: '#ff7a4a', exposure: 1.0, env: 0.3,
};
/** [hour, preset, star visibility 0..1] */
const KEYS: [number, AtmoDef, number][] = [
  [0, ATMO.night, 1], [4.6, ATMO.night, 1], [6.1, DAWN, 0.3], [8.2, ATMO.day, 0], [15.5, ATMO.day, 0],
  [17.6, ATMO.golden, 0], [18.9, DUSK, 0.3], [20.4, ATMO.night, 1], [24, ATMO.night, 1],
];

const COLS = ['top', 'mid', 'horizon', 'sunColor', 'cloudLit', 'cloudShade', 'fog', 'hemiSky', 'hemiGround', 'sunLight'] as const;
const NUMS = ['clouds', 'fogDensity', 'hemi', 'sun', 'exposure', 'env'] as const;
export type Blend = { [K in (typeof COLS)[number]]: THREE.Color } & { [K in (typeof NUMS)[number]]: number } & { stars: number };
export function makeBlend(): Blend {
  const b = { stars: 0 } as Blend;
  for (const c of COLS) (b as unknown as Record<string, THREE.Color>)[c] = new THREE.Color();
  for (const n of NUMS) (b as unknown as Record<string, number>)[n] = 0;
  return b;
}
const _a = new THREE.Color(), _b = new THREE.Color();
export function blendAt(hour: number, out: Blend) {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const [h0, d0, s0] = KEYS[i], [h1, d1, s1] = KEYS[i + 1];
  const t0 = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0))), t = t0 * t0 * (3 - 2 * t0);
  for (const c of COLS) (out[c] as THREE.Color).copy(_a.set(d0[c])).lerp(_b.set(d1[c]), t);
  for (const n of NUMS) (out as unknown as Record<string, number>)[n] = d0[n] + (d1[n] - d0[n]) * t;
  out.stars = s0 + (s1 - s0) * t;
}
/** Direction the key light comes from. The sun rides 06:00→18:30 (east → west); the moon takes over and keeps travelling, so the light never jumps. */
export function lightDirAt(hour: number, out: THREE.Vector3) {
  const day = hour >= 6 && hour < 18.5;
  const th = day ? ((hour - 6) / 12.5) * Math.PI : (((hour < 6 ? hour + 24 : hour) - 18.5) / 11.5) * Math.PI;
  const x = day ? Math.cos(th) : -Math.cos(th);
  out.set(x * 0.85, Math.max(0.2, Math.sin(th)), -0.5).normalize();
}
