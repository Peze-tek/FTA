export type V3 = [number, number, number];
export interface Shot {
  from: V3; to: V3;       // camera dolly start -> end
  look: V3; lookTo?: V3;  // look-at point (optionally drifting)
  dur: number;            // seconds
  fov?: number; fovTo?: number;
  caption?: string;
  /** sound cues fired when the shot starts (drama!) */
  sfx?: Cue[];
}
export type Cue = 'boom' | 'riser' | 'drama' | 'drone' | 'murmur' | 'cash' | 'zap' | 'keys' | 'heartbeat' | 'thunder' | 'whoosh' | 'stinger';
export interface CutsceneDef { stage?: 'rooftop' | 'boardroom'; shots: Shot[] }

/** Stage centre for the L1 finale: a rooftop floating above the city skyline. */
export const ROOFTOP = { x: 150, y: 60, z: -75 };
/** Rugpull's private boardroom (opening scene): a sealed room floating far above the city. Local +Z points at the camera end. */
export const BOARD = { x: 150, y: 150, z: -260 };
const B = BOARD;
const bx = (x: number, y: number, z: number): V3 => [B.x + x, B.y + y, B.z + z];

export const CUTSCENES: Record<string, CutsceneDef> = {
  // Opening: Rugpull pitches his next rug to KOLs and big corporations. (Fictional names only.)
  boardroom: {
    stage: 'boardroom',
    shots: [
      { from: bx(-8, 5.2, 12.2), to: bx(7, 3.4, 11), look: bx(0, 1.4, -2), lookTo: bx(0, 1.6, -3), dur: 4.2, fov: 58,
        caption: 'RUGGED PUB · PRIVATE BOARDROOM · 3 AM', sfx: ['drone', 'murmur'] },
      { from: bx(2.5, 2.4, -0.5), to: bx(1.2, 2.0, -2.2), look: bx(0, 2.0, -4.6), dur: 4.2, fov: 46,
        caption: 'RUGPULL: "Gentlemen. FAPCOIN was practice."', sfx: ['drama'] },
      { from: bx(-1.5, 3.2, -1.2), to: bx(0, 3.6, -2.4), look: bx(0, 3.8, -6.9), dur: 4.6, fov: 44,
        caption: 'NEXT RUG: $MOONSCAM. 100x. "Locked liquidity." (It is not locked.)', sfx: ['riser', 'zap'] },
      { from: bx(-5.6, 1.9, 5.2), to: bx(-4.2, 1.7, 2.2), look: bx(-2.6, 1.5, 0.6), lookTo: bx(-2.6, 1.5, 3.4), dur: 4.4, fov: 46,
        caption: 'KOL: "Ten percent of supply for the thread? Shill it Friday. Easy."', sfx: ['cash'] },
      { from: bx(5.6, 1.9, 5.2), to: bx(4.2, 1.7, 2.4), look: bx(2.6, 1.5, 0.6), lookTo: bx(2.6, 1.5, 3.4), dur: 4.4, fov: 46,
        caption: 'EXCHANGE CEO: "Listing fee waived — if we get first dump."', sfx: ['cash', 'murmur'] },
      { from: bx(0, 2.0, 5), to: bx(0, 2.1, -1.2), look: bx(0, 2.3, -4.6), dur: 4, fov: 42,
        caption: 'RUGPULL: "By the time they notice, we are already gone."', sfx: ['riser', 'drama', 'boom'] },
      { from: bx(0, 1.6, 4.5), to: bx(0, 1.7, 2.5), look: bx(0, 1.9, -4.6), dur: 3.4, fov: 38,
        caption: 'Meanwhile, in Lagos Market…', sfx: ['whoosh', 'drone'] },
    ],
  },
  // Jack finds Satoshi Shitoshi's laptop in the gutter. Shitoshi is never seen, only his notes.
  intro: {
    shots: [
      { from: [-5, 3, 3], to: [-2.2, 1.7, -0.2], look: [0, 0.4, -3], dur: 3.4,
        caption: 'A laptop. Face-down in the gutter. Sticker: "SATOSHI SHITOSHI".', sfx: ['drone', 'heartbeat'] },
      { from: [-1.6, 1.3, -1.4], to: [-0.5, 0.9, -2.0], look: [0, 0.45, -3], dur: 4,
        caption: 'NOTE: "day 1 — deployed FAPCOIN. 1,000,000 supply. free fun coin for the culture."', sfx: ['keys'] },
      { from: [1.8, 1.0, -1.8], to: [0.6, 0.8, -2.2], look: [0, 0.5, -3], dur: 4,
        caption: 'NOTE: "day 400 — dev is tired. going to sleep. if somebody rugs it... fix it."', sfx: ['heartbeat', 'drone'] },
      { from: [0.5, 0.9, -1.8], to: [0.2, 0.85, -2.4], look: [0, 0.55, -3], dur: 3.6,
        caption: 'NOTE: "p.s. 30% tax is NOT mine. — S.S."   Someone hijacked the coin. Time to build a crew.', sfx: ['riser', 'drama'] },
    ],
  },
  // End of Level 1: crew assembled on the rooftop, camera dolly + pull-back over the skyline.
  rooftop: {
    stage: 'rooftop',
    shots: [
      { from: [ROOFTOP.x - 10, ROOFTOP.y + 2.4, ROOFTOP.z + 13], to: [ROOFTOP.x + 8, ROOFTOP.y + 2.0, ROOFTOP.z + 11],
        look: [ROOFTOP.x, ROOFTOP.y + 1.5, ROOFTOP.z], dur: 4.5, fov: 55,
        caption: 'Six legends. One abandoned coin.', sfx: ['drone', 'drama'] },
      { from: [ROOFTOP.x + 9, ROOFTOP.y + 1.2, ROOFTOP.z + 6], to: [ROOFTOP.x - 2, ROOFTOP.y + 1.2, ROOFTOP.z + 4.5],
        look: [ROOFTOP.x + 1, ROOFTOP.y + 1.6, ROOFTOP.z], dur: 4.5, fov: 48,
        caption: 'Rugpull owns the Rugged Pub. And the 30% tax.', sfx: ['boom', 'murmur'] },
      { from: [ROOFTOP.x, ROOFTOP.y + 1.0, ROOFTOP.z + 7], to: [ROOFTOP.x, ROOFTOP.y + 1.9, ROOFTOP.z + 3.2],
        look: [ROOFTOP.x, ROOFTOP.y + 1.9, ROOFTOP.z], dur: 4, fov: 42,
        caption: 'JACK: "We take FAPCOIN from one cent to $1000."', sfx: ['riser'] },
      { from: [ROOFTOP.x, ROOFTOP.y + 3.5, ROOFTOP.z - 5], to: [ROOFTOP.x, ROOFTOP.y + 18, ROOFTOP.z - 24],
        look: [ROOFTOP.x, ROOFTOP.y - 20, ROOFTOP.z + 60], lookTo: [ROOFTOP.x, ROOFTOP.y - 30, ROOFTOP.z + 90],
        dur: 5.5, fov: 68, caption: 'NEXT: CAPTIVE & DUMP', sfx: ['whoosh', 'riser', 'boom'] },
    ],
  },
};

// ---- Level 5 ending. Scene origin = the duel rooftop (deck y=0). Level5.tsx syncs its effects to this timeline:
// ending: 0-4 burn chain | 4-9 Tek airdrop | 9-13.5 Robofap burns supply | 13.5-23.5 price pump + fireworks
CUTSCENES.ending = {
  shots: [
    { from: [3.2, 1.7, 4], to: [1.2, 1, 2.2], look: [0, 0.4, 0], dur: 4, fov: 52,
      caption: 'JACK: "Rugpull is done. Burn his chain — the 30% tax dies with it."' },
    { from: [-9, 3, 11], to: [-4, 9, 15], look: [0, 14, 0], lookTo: [0, 2, 0], dur: 5, fov: 62,
      caption: 'TEK: "Airdrop inbound. Every OG holder gets a bag. No tax. No catch."' },
    { from: [4, 2, 7], to: [1, 4.5, 6], look: [-7, 3, -5], lookTo: [-7, 8, -5], dur: 4.5, fov: 58,
      caption: 'ROBOFAP: "Burning the extra supply. 500,000 FAP. Gone forever."' },
    { from: [0, 6, 22], to: [0, 24, 46], look: [0, 24, -40], lookTo: [0, 30, -60], dur: 10, fov: 62, fovTo: 74,
      caption: 'FAPCOIN  $89 → $1,000' },
  ],
};
CUTSCENES.grave = {
  shots: [
    { from: [4, 1.8, 5], to: [2, 1.3, -1.5], look: [0, 1, -5], dur: 5, fov: 50,
      caption: 'Rugpull. Rugged by his own hand.' },
    { from: [2, 1.5, -1], to: [0.6, 1.0, -3.3], look: [0, 0.8, -5], dur: 3.6, fov: 44,
      caption: 'A cheap pine cross. One green candle.' },
  ],
};

export const cutsceneLength = (id: string) => CUTSCENES[id]?.shots.reduce((a, s) => a + s.dur, 0) ?? 0;
