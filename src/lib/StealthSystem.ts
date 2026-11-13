/**
 * StealthSystem — Rugged Pub basement (Level 2).
 * Guards patrol, have a vision cone + line-of-sight (blocked by walls), react to noise, and fill the
 * player's StealthMeter (0..100). Meter >= 100 = caught.
 */
import { Vector3 } from 'three';
import { newAnim, type AnimState } from '@/lib/anim';
import { resolveCircle, type AABB } from '@/lib/colliders';

export type GuardState = 'patrol' | 'suspicious' | 'chase' | 'investigate';

export const STEALTH = {
  range: 13,            // vision distance (m)
  halfFov: 0.72,        // rad (~41 deg each side)
  crouchRange: 0.5,     // crouching halves how far you can be seen
  stillRange: 0.8,      // standing still shrinks it a bit
  patrolSpeed: 1.9,
  investigateSpeed: 2.6,
  chaseSpeed: 3.7,
  catchDist: 1.3,       // grabbed
  decay: 12,            // meter loss / sec when unseen
  suspicious: 22,       // meter at which guards stop and stare
  alert: 60,            // meter at which guards chase
};

export interface Guard {
  id: number;
  pos: Vector3;
  yaw: number;          // faces (sin yaw, cos yaw)
  path: Vector3[];
  idx: number;
  dir: 1 | -1;
  state: GuardState;
  wait: number;
  target: Vector3;
  lastSeen: Vector3;
  chaseTimer: number;
  sees: boolean;
  anim: { current: AnimState };
}

const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function segHitsBox(ax: number, az: number, bx: number, bz: number, b: AABB) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const axes: [number, number, number, number][] = [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]];
  for (const [a, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) { if (a < mn || a > mx) return false; }
    else {
      let ta = (mn - a) / d, tb = (mx - a) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export interface PlayerSense { pos: Vector3; crouching: boolean; moving: boolean; speed: number }

export class StealthSystem {
  guards: Guard[] = [];
  meter = 0;
  caught = false;
  private starts: { pos: Vector3; idx: number; dir: 1 | -1 }[] = [];

  constructor(paths: Vector3[][], private walls: AABB[], offsets: number[] = []) {
    paths.forEach((path, i) => {
      const idx = Math.min(path.length - 1, offsets[i] ?? 0);
      const pos = path[idx].clone();
      this.starts.push({ pos, idx, dir: idx === 0 ? 1 : -1 });
      this.guards.push({
        id: i, pos: pos.clone(), yaw: 0, path, idx, dir: idx === 0 ? 1 : -1, state: 'patrol', wait: 0,
        target: pos.clone(), lastSeen: pos.clone(), chaseTimer: 0, sees: false, anim: { current: newAnim() },
      });
    });
  }

  reset() {
    this.meter = 0; this.caught = false;
    this.guards.forEach((g, i) => {
      const s = this.starts[i];
      g.pos.copy(s.pos); g.idx = s.idx; g.dir = s.dir; g.state = 'patrol'; g.wait = 0; g.sees = false; g.chaseTimer = 0;
    });
  }

  /** Make noise (cage breaking, etc.): nearby guards go and investigate. */
  noise(pos: Vector3, radius: number) {
    for (const g of this.guards) {
      if (g.state === 'chase') continue;
      if (g.pos.distanceTo(pos) < radius) { g.state = 'investigate'; g.target.copy(pos); g.wait = 0; }
    }
  }

  private blocked(ax: number, az: number, bx: number, bz: number) {
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    for (const w of this.walls) {
      if (w.maxX < minX || w.minX > maxX || w.maxZ < minZ || w.minZ > maxZ) continue;
      if (segHitsBox(ax, az, bx, bz, w)) return true;
    }
    return false;
  }

  private turn(g: Guard, to: number, rate: number) {
    const d = angDiff(g.yaw, to);
    g.yaw += Math.max(-rate, Math.min(rate, d));
  }

  private moveToward(g: Guard, t: Vector3, speed: number, dt: number, collide = false) {
    const dx = t.x - g.pos.x, dz = t.z - g.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const step = Math.min(d, speed * dt);
    g.pos.x += (dx / d) * step; g.pos.z += (dz / d) * step;
    this.turn(g, Math.atan2(dx, dz), 8 * dt);
    if (collide) resolveCircle(g.pos, 0.45);
    g.anim.current.speed = speed > 3 ? 1 : 0.6;
    return d - step < 0.15;
  }

  update(dt: number, p: PlayerSense) {
    let maxRate = 0;
    for (const g of this.guards) {
      const dx = p.pos.x - g.pos.x, dz = p.pos.z - g.pos.z;
      const dist = Math.hypot(dx, dz);
      let range = STEALTH.range;
      if (p.crouching) range *= STEALTH.crouchRange; else if (!p.moving) range *= STEALTH.stillRange;
      const cosA = dist > 1e-4 ? (Math.sin(g.yaw) * dx + Math.cos(g.yaw) * dz) / dist : 1;
      const inCone = dist < range && Math.acos(Math.max(-1, Math.min(1, cosA))) <= STEALTH.halfFov;
      const close = dist < 2.2;
      const los = (inCone || close) && !this.blocked(g.pos.x, g.pos.z, p.pos.x, p.pos.z);
      g.sees = los;
      if (los) {
        let rate = 20 + (1 - Math.min(1, dist / range)) * 70;
        if (close) rate = 120;
        if (p.speed > 5.5 && !p.crouching) rate *= 1.3;
        maxRate = Math.max(maxRate, rate);
        g.lastSeen.copy(p.pos);
        g.chaseTimer = 3;
        if (dist < STEALTH.catchDist) this.meter = 100;
      }
    }
    if (maxRate > 0) this.meter = Math.min(100, this.meter + maxRate * dt);
    else this.meter = Math.max(0, this.meter - STEALTH.decay * dt);

    for (const g of this.guards) {
      g.anim.current.speed = 0;
      if (g.sees && this.meter >= STEALTH.alert) g.state = 'chase';
      else if (g.sees && this.meter >= STEALTH.suspicious && g.state !== 'chase') g.state = 'suspicious';
      else if (g.state === 'chase') {
        g.chaseTimer -= dt;
        if (g.chaseTimer <= 0) { g.state = 'investigate'; g.target.copy(g.lastSeen); g.wait = 0; }
      } else if (g.state === 'suspicious' && !g.sees) { g.state = 'patrol'; }

      switch (g.state) {
        case 'patrol': {
          if (g.wait > 0) { g.wait -= dt; this.turn(g, g.yaw + Math.sin(performance.now() / 500 + g.id) * 0.05, 1); break; }
          const t = g.path[g.idx];
          if (this.moveToward(g, t, STEALTH.patrolSpeed, dt)) {
            if (g.idx + g.dir < 0 || g.idx + g.dir >= g.path.length) { g.dir = (g.dir * -1) as 1 | -1; g.wait = 0.8; }
            g.idx += g.dir;
            g.idx = Math.max(0, Math.min(g.path.length - 1, g.idx));
          }
          break;
        }
        case 'suspicious':
          this.turn(g, Math.atan2(p.pos.x - g.pos.x, p.pos.z - g.pos.z), 6 * dt);
          break;
        case 'chase':
          this.moveToward(g, g.lastSeen, STEALTH.chaseSpeed, dt, true);
          break;
        case 'investigate': {
          if (this.moveToward(g, g.target, STEALTH.investigateSpeed, dt, true)) {
            g.wait += dt;
            this.turn(g, g.yaw + 2.2 * dt, 1); // look around
            if (g.wait > 2) {
              // return to the nearest patrol node
              let best = 0, bd = Infinity;
              g.path.forEach((n, i) => { const d = n.distanceTo(g.pos); if (d < bd) { bd = d; best = i; } });
              g.idx = best; g.state = 'patrol'; g.wait = 0;
            }
          }
          break;
        }
      }
    }
    if (this.meter >= 100) this.caught = true;
    return { meter: this.meter, caught: this.caught };
  }
}
