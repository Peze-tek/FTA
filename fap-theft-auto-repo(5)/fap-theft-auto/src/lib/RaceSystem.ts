/**
 * RaceSystem — Level 4 "Red Candle Race" logic (pure TS, headless-testable).
 * A winding two-way road: `d` is metres travelled ALONG the road, `x` is the lateral offset from the centre line.
 * Jack's sports car (Meast riding shotgun, Paper Hands in the back) vs 5 Red Candle sports cars.
 *  - 3 racing lanes (smooth lateral slide), rubber-band rival AI that cuts into your lane
 *  - ONCOMING CIVILIAN TRAFFIC drives straight at you: dodge it or crash (speed loss + price hit)
 *  - Meast barrel throws knock a rival down
 *  - RedCandleDebuff: every close rival drains 2% of the price per second
 */
import { rng } from '@/lib/rng';

export const LANES = [-4.5, 0, 4.5] as const;
export const RACE = {
  length: 1800,
  cruise: 30, boost: 42, accel: 8,
  boostMax: 100, boostDrain: 38, boostRegen: 14,
  barrelCd: 1.7, barrelRange: 30, knockTime: 2.6,
  close: { dz: 9, dx: 3.2 },        // a rival this near, in your lane, is "on you"
  debuffPerSec: 0.02,               // -2% price per close rival per second
  bumpDz: 3.2, bumpDx: 1.7,
  count: 5,
  rivalBase: 25.0, rivalStep: 0.85,
  crashTime: 1.5, crashSlow: 0.35, crashPenalty: 0.10, // price x0.90 per head-on
};
/** Oncoming traffic: all drive at the same speed so there is ALWAYS a free lane between groups. */
export const TRAFFIC = { speed: 14, first: 140, gapMin: 52, gapMax: 74, carDz: 2.5, carDx: 1.85, pairChance: 0.45 };

/* ------------------------------------------------------------------ the road */
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Lateral position of the road centre at distance d (straight for the first ~100 m, then S-bends). */
export function roadX(d: number) {
  const env = smooth(40, 160, d);
  return env * (17 * Math.sin(d * TAU / 260) + 6 * Math.sin(d * TAU / 105 + 1.3));
}
export interface RoadPt { x: number; z: number; yaw: number; fx: number; fz: number }
/** World point at distance d, lateral offset `off` from the centre line. yaw = direction of travel (model +z faces yaw). */
export function roadPoint(d: number, off = 0): RoadPt {
  const s = roadX(d + 0.5) - roadX(d - 0.5), len = Math.hypot(s, 1);
  const fx = s / len, fz = -1 / len;
  return { x: roadX(d) + (-fz) * off, z: -d + fx * off, yaw: Math.atan2(fx, fz), fx, fz };
}

export interface Biker {
  id: number; d: number; lane: number; x: number; speed: number; base: number;
  down: number; laneCd: number; close: boolean;
}
export interface Civ { id: number; d: number; lane: number; x: number; kind: number; hit: number; passed: boolean }
export interface RacePlayer {
  d: number; lane: number; x: number; speed: number; boost: number; barrelCd: number;
  bump: number; boosting: boolean; vx: number; crash: number; crashes: number;
}

export class RaceWorld {
  time = 0;
  player: RacePlayer = { d: 0, lane: 1, x: 0, speed: 0, boost: RACE.boostMax, barrelCd: 0, bump: 0, boosting: false, vx: 0, crash: 0, crashes: 0 };
  bikers: Biker[] = [];
  civs: Civ[] = [];
  finished = false;
  private rnd: () => number;
  private debuffT = 0;
  onBump?: (b: Biker) => void;
  onCrash?: (c: Civ) => void;
  onNearMiss?: (c: Civ) => void;

  constructor(seed = 4) {
    this.rnd = rng(seed);
    const slots: [number, number][] = [[1, 10], [0, 4], [2, 6], [1, -6], [2, -12]];
    for (let i = 0; i < RACE.count; i++) {
      const [lane, d] = slots[i];
      this.bikers.push({
        id: i, d, lane, x: LANES[lane], speed: 0, base: RACE.rivalBase + i * RACE.rivalStep,
        down: 0, laneCd: 1 + this.rnd() * 1.5, close: false,
      });
    }
    // oncoming traffic: groups of 1-2 cars (never 3 lanes blocked), all moving at the same speed
    let d = TRAFFIC.first, id = 0;
    while (d < RACE.length + 200) {
      const lanes = [0, 1, 2].sort(() => this.rnd() - 0.5);
      const n = this.rnd() < TRAFFIC.pairChance ? 2 : 1;
      for (let k = 0; k < n; k++) {
        this.civs.push({ id: id++, d: d + (this.rnd() - 0.5) * 8, lane: lanes[k], x: LANES[lanes[k]], kind: Math.floor(this.rnd() * 4), hit: 0, passed: false });
      }
      d += TRAFFIC.gapMin + this.rnd() * (TRAFFIC.gapMax - TRAFFIC.gapMin);
    }
  }

  switchLane(dir: -1 | 1) {
    const p = this.player;
    p.lane = Math.max(0, Math.min(2, p.lane + dir));
  }

  /** Meast hurls a barrel at the nearest live rival in range. Returns the victim (or null). */
  throwBarrel(): Biker | null {
    const p = this.player;
    if (p.barrelCd > 0) return null;
    let best: Biker | null = null, bd = Infinity;
    for (const b of this.bikers) {
      const gap = Math.abs(b.d - p.d);
      if (b.down > 0 || gap > RACE.barrelRange) continue;
      const score = gap + Math.abs(b.x - p.x) * 1.5;
      if (score < bd) { bd = score; best = b; }
    }
    p.barrelCd = RACE.barrelCd;
    if (best) { best.down = RACE.knockTime; best.close = false; }
    return best;
  }

  position() { return 1 + this.bikers.filter((b) => b.d > this.player.d).length; }

  /** Nearest oncoming car in the player's lane ahead (m), or Infinity. */
  threatAhead(lane = this.player.lane, range = 70): number {
    let best = Infinity;
    for (const c of this.civs) {
      if (c.hit > 0 || c.lane !== lane) continue;
      const gap = c.d - this.player.d;
      if (gap > 0 && gap < range && gap < best) best = gap;
    }
    return best;
  }

  private laneBlocked(d: number, lane: number, from = 4, to = 62) {
    for (const c of this.civs) if (c.lane === lane && c.d - d > from && c.d - d < to) return true;
    return false;
  }

  update(dt: number, boostHeld: boolean) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const p = this.player;
    p.barrelCd = Math.max(0, p.barrelCd - dt);
    p.bump = Math.max(0, p.bump - dt);
    p.crash = Math.max(0, p.crash - dt);

    // player speed / boost
    p.boosting = boostHeld && p.boost > 1 && !this.finished && p.crash <= 0;
    p.boost = Math.max(0, Math.min(RACE.boostMax, p.boost + (p.boosting ? -RACE.boostDrain : RACE.boostRegen) * dt));
    let target = this.finished ? 0 : p.boosting ? RACE.boost : RACE.cruise;
    if (p.bump > 0) target *= 0.7;
    if (p.crash > 0) target *= RACE.crashSlow;
    const acc = this.finished ? 16 : p.crash > 0 ? 30 : RACE.accel;
    p.speed += Math.sign(target - p.speed) * Math.min(Math.abs(target - p.speed), acc * dt);
    const prevD = p.d;
    p.d += p.speed * dt;
    const nx = p.x + (LANES[p.lane] - p.x) * Math.min(1, 7 * dt);
    p.vx = (nx - p.x) / Math.max(dt, 1e-4);
    p.x = nx;
    if (p.d >= RACE.length) this.finished = true;

    // ---- oncoming traffic
    for (const c of this.civs) {
      const pd = c.d;
      c.d -= TRAFFIC.speed * dt;
      c.hit = Math.max(0, c.hit - dt);
      // swept head-on test (closing speed is high, so test the interval we just crossed)
      const lo = c.d - TRAFFIC.carDz, hi = pd + TRAFFIC.carDz;
      if (!this.finished && p.crash <= 0 && c.hit <= 0 && Math.abs(c.x - p.x) < TRAFFIC.carDx && prevD <= hi && p.d >= lo) {
        p.crash = RACE.crashTime; p.crashes++; p.boosting = false; c.hit = 2.2; c.passed = true;
        this.onCrash?.(c);
      } else if (!c.passed && c.d < p.d - 1) {
        c.passed = true;
        if (Math.abs(c.x - p.x) < 3.6) this.onNearMiss?.(c);   // brushed past in the next lane
      }
    }

    for (const b of this.bikers) {
      b.down = Math.max(0, b.down - dt);
      const gap = b.d - p.d; // + = ahead of player
      let target = b.base;
      if (gap < 0) target += Math.min(7, -gap * 0.14);
      else if (gap > 30) target -= Math.min(5, (gap - 30) * 0.12);
      if (b.down > 0) target *= 0.2;
      b.speed += Math.sign(target - b.speed) * Math.min(Math.abs(target - b.speed), 7 * dt);
      b.d += b.speed * dt;

      b.laneCd -= dt;
      // rivals dodge oncoming traffic too
      if (b.down <= 0 && this.laneBlocked(b.d, b.lane, 2, 46)) {
        const opts = [b.lane - 1, b.lane + 1].filter((l) => l >= 0 && l <= 2 && !this.laneBlocked(b.d, l, -4, 60));
        if (opts.length) { b.lane = opts[Math.floor(this.rnd() * opts.length)]; b.laneCd = 0.7; }
      } else if (b.laneCd <= 0 && b.down <= 0) {
        b.laneCd = 1.1 + this.rnd() * 1.6;
        const tryLane = (l: number) => l >= 0 && l <= 2 && !this.laneBlocked(b.d, l, -4, 60);
        if (Math.abs(gap) < 16 && b.lane !== p.lane && this.rnd() < 0.6) { const l = b.lane + Math.sign(p.lane - b.lane); if (tryLane(l)) b.lane = l; } // cut in
        else if (this.rnd() < 0.25) { const l = b.lane + (this.rnd() < 0.5 ? -1 : 1); if (tryLane(l)) b.lane = l; }
      }
      b.x += (LANES[b.lane] - b.x) * Math.min(1, 5 * dt);

      b.close = b.down <= 0 && Math.abs(gap) < RACE.close.dz && Math.abs(b.x - p.x) < RACE.close.dx;
      if (b.down <= 0 && p.bump <= 0 && Math.abs(gap) < RACE.bumpDz && Math.abs(b.x - p.x) < RACE.bumpDx) {
        p.bump = 0.7; b.laneCd = 0.2;
        b.lane = Math.max(0, Math.min(2, b.lane + (b.x >= p.x ? 1 : -1)));
        this.onBump?.(b);
      }
    }
  }

  closeCount() { return this.bikers.filter((b) => b.close).length; }

  /**
   * RedCandleDebuff — call every frame with the current price; returns the new price.
   * Each second, every close rival knocks 2% off FAPCOIN.
   */
  RedCandleDebuff(price: number, dt: number): number {
    if (this.finished) { this.debuffT = 0; return price; }
    this.debuffT += dt;
    while (this.debuffT >= 1) {
      this.debuffT -= 1;
      price *= Math.pow(1 - RACE.debuffPerSec, this.closeCount());
    }
    return price;
  }
}
