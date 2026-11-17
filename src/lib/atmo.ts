/** Time-of-day presets (sky, fog, lights). The active one is chosen from the game state in GameCanvas. */
export type AtmoId = 'night' | 'day' | 'golden';

export interface AtmoDef {
  top: string; mid: string; horizon: string;      // sky gradient
  sunColor: string; sunDir: [number, number, number];
  clouds: number;                                  // 0 = none
  cloudLit: string; cloudShade: string;
  stars: boolean;
  fog: string; fogDensity: number;
  hemiSky: string; hemiGround: string; hemi: number;
  sun: number; sunLight: string;
  exposure: number; env: number;                  // tone-map exposure, environment-map (reflection / ambient) intensity
}

export const ATMO: Record<AtmoId, AtmoDef> = {
  night: {
    top: '#04020c', mid: '#120a28', horizon: '#2a1550', sunColor: '#cfd8ff', sunDir: [-0.4, 0.75, -0.5], clouds: 0,
    cloudLit: '#6a5a9a', cloudShade: '#1c1238', stars: true,
    fog: '#150c2b', fogDensity: 0.019, hemiSky: '#6d5bd0', hemiGround: '#1a1030', hemi: 0.9, sun: 0.8, sunLight: '#9db4ff', exposure: 1, env: 0.15,
  },
  day: {
    top: '#2f78d6', mid: '#6fb0ee', horizon: '#dcebf7', sunColor: '#fff1d0', sunDir: [0.45, 0.62, -0.5], clouds: 0.55,
    cloudLit: '#ffffff', cloudShade: '#aebdd2', stars: false,
    fog: '#cfe0ee', fogDensity: 0.0068, hemiSky: '#bfdcff', hemiGround: '#7a735f', hemi: 1.05, sun: 3.0, sunLight: '#fff0d6', exposure: 0.95, env: 0.55,
  },
  golden: {
    top: '#2a4f93', mid: '#c98aa6', horizon: '#ffc58f', sunColor: '#ffb36b', sunDir: [0.75, 0.24, -0.45], clouds: 0.6,
    cloudLit: '#ffd0b0', cloudShade: '#8f6a9a', stars: false,
    fog: '#e2ab8e', fogDensity: 0.0095, hemiSky: '#a9b7e6', hemiGround: '#6b5240', hemi: 0.95, sun: 3.2, sunLight: '#ffa768', exposure: 1.0, env: 0.5,
  },
};
