/**
 * GunSystem — Level 5: Jack's pistol (auto-aim hitscan, magazine + reload) and Rugpull's crew:
 *   grunt   — melee rusher (generic CombatWorld AI)
 *   shooter — keeps its distance, telegraphs, fires a slow, dodgeable bullet
 *   brute   — tanky melee (generic AI, armoured)
 * Pure TS, headless-testable.
 */
import { CombatWorld, makeFighter, type Fighter } from '@/lib/CombatSystem';

export const GUN = { magSize: 12, damage: 14, cooldown: 0.28, reload: 1.3, range: 30, cone: 0.7, hitPad: 0.2, knock: 2.2 };

export interface Gun { has: boolean; mag: number; reload: number; cd: number }
export const newGun = (): Gun => ({ has: false, mag: GUN.magSize, reload: 0, cd: 0 });
export const updateGun = (g: Gun, dt: number) => {
  g.cd = Math.max(0, g.cd - dt);
  if (g.reload > 0) { g.reload -= dt; if (g.reload <= 0) { g.reload = 0; g.mag = GUN.magSize; } }
};

const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface Shot { from: { x: number; z: number }; to: { x: number; z: number }; yaw: number; hit: Fighter | null; landed: boolean }

/** Pull the trigger. Auto-aims at the best live, vulnerable enemy inside the cone; else fires straight ahead. */
export function shoot(g: Gun, world: CombatWorld, jake: Fighter): Shot | null {
  if (!g.has || g.reload > 0 || g.cd > 0) return null;
  if (g.mag <= 0) { g.reload = GUN.reload; return null; }
  g.mag--; g.cd = GUN.cooldown;
  if (g.mag <= 0) g.reload = GUN.reload;

  let yaw = jake.yaw, bestScore = Infinity;
  for (const e of world.enemiesOf(jake)) {
    if (e.invincible) continue;
    const dx = e.pos.x - jake.pos.x, dz = e.pos.z - jake.pos.z, d = Math.hypot(dx, dz);
    if (d > GUN.range) continue;
    const a = Math.abs(angDiff(jake.yaw, Math.atan2(dx, dz)));
    if (a > GUN.cone) continue;
    const score = a * 12 + d;
    if (score < bestScore) { bestScore = score; yaw = Math.atan2(dx, dz); }
  }
  jake.yaw = yaw;
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  let hit: Fighter | null = null, ht = GUN.range;
  for (const e of world.enemiesOf(jake)) {
    const dx = e.pos.x - jake.pos.x, dz = e.pos.z - jake.pos.z;
    const t = dx * sx + dz * sz;                    // along the ray
    if (t < 0 || t > ht) continue;
    const perp = Math.abs(dx * sz - dz * sx);       // distance from the ray
    if (perp <= e.radius + GUN.hitPad) { hit = e; ht = t; }
  }
  let landed = false;
  if (hit) landed = world.damage(hit, GUN.damage, jake.pos, GUN.knock, jake);
  return { from: { x: jake.pos.x, z: jake.pos.z }, to: { x: jake.pos.x + sx * ht, z: jake.pos.z + sz * ht }, yaw, hit, landed };
}

/* ------------------------------------------------------------------ crew */
export const CREW = {
  grunt: { hp: 56, radius: 0.5, reach: 1.8, speed: 4.0, damage: 9, windup: 0.45, cooldown: 1.0, kind: 'biker' as const },
  shooter: { hp: 42, radius: 0.5, speed: 2.4, damage: 10, windup: 0.5, cdMin: 1.0, cdMax: 1.8, bulletSpeed: 20, near: 6, far: 11, kind: 'guard' as const },
  brute: { hp: 150, radius: 0.9, reach: 2.4, speed: 2.6, damage: 15, windup: 0.6, cooldown: 1.3, kind: 'bear' as const },
};
export type CrewRole = keyof typeof CREW;

/** Rugpull's special agents: only sent at a 4★+ wanted level. Tough, fast, accurate — they fire fast 3-round bursts. */
export const AGENT = { hp: 140, radius: 0.5, speed: 3.5, damage: 12, windup: 0.3, cdMin: 1.2, cdMax: 1.9, bulletSpeed: 32, near: 7, far: 14, burst: 3, burstGap: 0.12, range: 24 };
export function makeAgent(id: string): Fighter {
  const f = makeFighter({ id, label: 'RUGPULL AGENT', team: 'bears', kind: 'guard', role: 'agent', hp: AGENT.hp, maxHp: AGENT.hp, radius: AGENT.radius, speed: AGENT.speed, damage: AGENT.damage, manual: true, kbResist: 0.5 });
  f.anim.armed = 2;
  return f;
}

export function makeCrew(id: string, role: CrewRole, label: string): Fighter {
  const c = CREW[role];
  const base = { id, label, team: 'bears' as const, kind: c.kind, role, hp: c.hp, maxHp: c.hp, radius: c.radius, speed: c.speed, damage: c.damage };
  if (role === 'shooter') return makeFighter({ ...base, manual: true, kbResist: 1 });
  const m = CREW[role as 'grunt' | 'brute'];
  return makeFighter({ ...base, reach: m.reach, windupTime: m.windup, cooldown: m.cooldown, armor: role === 'brute', kbResist: role === 'brute' ? 0.4 : 1 });
}

export interface Bullet { x: number; z: number; vx: number; vz: number; life: number; dmg: number }

export class Crew {
  bullets: Bullet[] = [];
  private st = new Map<Fighter, { b: number; mode: 'move' | 'wind'; t: number; cd: number; strafe: number; sT: number; ax: number; az: number }>();
  onFire?: (b: Bullet, from: Fighter) => void;
  onHitJake?: (dmg: number) => void;
  constructor(private world: CombatWorld, private jake: Fighter) {}

  update(dt: number, jakeY: number) {
    dt = Math.min(dt, 0.05);
    const j = this.jake;
    for (const f of this.world.fighters) {
      if ((f.role !== 'shooter' && f.role !== 'agent') || f.hp <= 0) continue;
      const ag = f.role === 'agent', C = ag ? AGENT : CREW.shooter;
      let s = this.st.get(f);
      if (!s) { s = { b: 0, mode: 'move', t: 0, cd: C.cdMin + Math.random() * 1.2, strafe: Math.random() < 0.5 ? 1 : -1, sT: 1 + Math.random() * 2, ax: 0, az: 0 }; this.st.set(f, s); }
      if (f.stun > 0) { f.stun -= dt; f.anim.speed = 0; s.mode = 'move'; f.anim.windup = 0; continue; }
      const dx = j.pos.x - f.pos.x, dz = j.pos.z - f.pos.z, d = Math.hypot(dx, dz) || 1e-4;
      f.yaw = Math.atan2(dx, dz);
      if (s.mode === 'move') {
        let mx = 0, mz = 0;
        if (d > C.far) { mx = dx / d; mz = dz / d; }
        else if (d < C.near) { mx = -dx / d; mz = -dz / d; }
        else { s.sT -= dt; if (s.sT <= 0) { s.strafe *= -1; s.sT = 1 + Math.random() * 2; } mx = (dz / d) * s.strafe; mz = (-dx / d) * s.strafe; }
        f.pos.x += mx * C.speed * dt; f.pos.z += mz * C.speed * dt;
        f.anim.speed = Math.min(1, C.speed / 3.5);
        s.cd -= dt;
        if (s.cd <= 0 && d < (ag ? AGENT.range : 16)) { s.mode = 'wind'; s.t = C.windup; s.b = ag ? AGENT.burst : 1; s.ax = j.pos.x; s.az = j.pos.z; f.anim.windup = 1; f.anim.speed = 0; }
      } else {
        s.t -= dt; f.anim.speed = 0;
        if (s.t <= 0) {
          f.anim.windup = 0; f.anim.punch = 1;
          const ex = s.ax - f.pos.x, ez = s.az - f.pos.z, ed = Math.hypot(ex, ez) || 1;
          const b: Bullet = { x: f.pos.x, z: f.pos.z, vx: (ex / ed) * C.bulletSpeed, vz: (ez / ed) * C.bulletSpeed, life: 2.2, dmg: ag ? f.damage : C.damage };
          this.bullets.push(b); this.onFire?.(b, f);
          if (--s.b > 0) { s.t = AGENT.burstGap; s.ax = j.pos.x + j.vel.x * 0.1; s.az = j.pos.z + j.vel.z * 0.1; f.anim.windup = 1; }   // next round of the burst, re-aimed
          else { s.mode = 'move'; s.cd = C.cdMin + Math.random() * (C.cdMax - C.cdMin); }
        }
      }
    }
    // bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.life > 0 && Math.hypot(b.x - j.pos.x, b.z - j.pos.z) < j.radius + 0.25 && jakeY < 1.3 && !j.invincible && j.hp > 0) {
        b.life = 0;
        if (this.world.damage(j, b.dmg, { x: b.x - b.vx * 0.1, z: b.z - b.vz * 0.1 }, 3, null)) this.onHitJake?.(b.dmg);
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }
}
