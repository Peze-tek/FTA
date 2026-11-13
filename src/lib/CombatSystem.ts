/**
 * CombatSystem — brawler logic (Level 3: Jack + Meast vs the Bear Twins; reused by the Level 5 duel).
 * Dependency-free on purpose (own tiny Vec) so the fight maths can be unit-simulated headlessly.
 *
 *  - punches (arc melee with a small aim-assist for the player)
 *  - enemy / ally AI: approach, wind up (telegraph), strike, cooldown
 *  - MeastMode(): 5s invincible "super saiyan" + 3x damage + speed up, ground slam on start AND on end
 */
import { newAnim, type AnimState } from '@/lib/anim';
import type { CharId } from '@/lib/types';

export class Vec {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  copy(o: { x: number; y: number; z: number }) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
}

export type Team = 'heroes' | 'bears';

export interface Fighter {
  id: string; label: string; team: Team; kind: CharId;
  pos: Vec; vel: Vec; yaw: number;
  hp: number; maxHp: number; radius: number;
  reach: number; speed: number; damage: number;
  windupTime: number; cooldown: number; attackSpeed: number;
  atkCd: number; windup: number; stun: number;
  invincible: boolean; armor: boolean; kbResist: number; isPlayer: boolean;
  threat: number; // <1 = enemies prefer to target this fighter
  role: string;    // free-form tag ('grunt' | 'shooter' | 'brute' | ...)
  manual: boolean; // true = scripted by a boss controller (skips the generic AI)
  anim: AnimState; ref: { current: AnimState };
}

export function makeFighter(o: Partial<Fighter> & Pick<Fighter, 'id' | 'team' | 'kind'>): Fighter {
  const anim = newAnim();
  return {
    label: o.id, pos: new Vec(), vel: new Vec(), yaw: 0, hp: 100, maxHp: 100, radius: 0.5, reach: 1.8, speed: 3,
    damage: 10, windupTime: 0.5, cooldown: 1.2, attackSpeed: 1, atkCd: 0.6, windup: 0, stun: 0,
    invincible: false, armor: false, kbResist: 1, isPlayer: false, threat: 1, role: '', manual: false, anim, ref: { current: anim },
    ...o,
  } as Fighter;
}

export const PUNCH = { range: 1.9, arc: Math.PI * 0.95, damage: 9, cooldown: 0.32, knock: 3.4 };

export interface HitEvent { target: Fighter; attacker: Fighter | null; amount: number; blocked: boolean; big: boolean }

const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class CombatWorld {
  fighters: Fighter[] = [];
  time = 0;
  bounds: { x: number; z: number; r: number } | null = null;
  /** Rectangular play area (streets). Non-player fighters are clamped inside. */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  onHit?: (e: HitEvent) => void;
  onSlam?: (pos: Vec, radius: number) => void;

  add(f: Fighter) { this.fighters.push(f); return f; }
  alive(team: Team) { return this.fighters.filter((f) => f.team === team && f.hp > 0); }
  enemiesOf(f: Fighter) { return this.fighters.filter((o) => o.team !== f.team && o.hp > 0); }
  nearestEnemy(f: Fighter) {
    let best: Fighter | null = null, bd = Infinity;
    for (const e of this.enemiesOf(f)) {
      const d = Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) * e.threat;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Apply damage. Returns true if it landed (not blocked by invincibility). */
  damage(t: Fighter, amount: number, from: { x: number; z: number } | null, knock = 3, attacker: Fighter | null = null) {
    if (t.hp <= 0) return false;
    if (t.invincible) { this.onHit?.({ target: t, attacker, amount: 0, blocked: true, big: false }); return false; }
    t.hp = Math.max(0, t.hp - amount);
    t.anim.hit = 1;
    if (from) {
      const dx = t.pos.x - from.x, dz = t.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      const k = knock * t.kbResist;
      t.vel.x += (dx / d) * k; t.vel.z += (dz / d) * k;
    }
    if (!t.armor || amount >= 20) { t.stun = Math.max(t.stun, t.armor ? 0.5 : 0.22); t.windup = 0; t.anim.windup = 0; }
    if (t.hp <= 0) { t.anim.dead = true; t.anim.speed = 0; t.windup = 0; }
    this.onHit?.({ target: t, attacker, amount, blocked: false, big: amount >= 20 });
    return true;
  }

  /** Melee arc. `assist` lets the player connect with a nearby enemy even if slightly off-angle. */
  punch(a: Fighter, mult = 1, assist = false) {
    let hits = 0;
    for (const e of this.enemiesOf(a)) {
      const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      const reach = PUNCH.range + e.radius;
      const inArc = d <= reach && Math.abs(angDiff(a.yaw, Math.atan2(dx, dz))) <= PUNCH.arc / 2;
      if (inArc || (assist && d <= reach * 1.25)) {
        if (this.damage(e, a.damage * mult, a.pos, PUNCH.knock, a)) hits++;
      }
    }
    return hits;
  }

  /** Ground slam: damages + launches every enemy of `team` inside `radius`. */
  slam(origin: Vec, radius: number, dmg: number, team: Team, knock = 11, attacker: Fighter | null = null) {
    this.onSlam?.(origin, radius);
    for (const e of this.fighters) {
      if (e.team === team || e.hp <= 0) continue;
      const d = Math.hypot(e.pos.x - origin.x, e.pos.z - origin.z);
      if (d > radius + e.radius) continue;
      if (this.damage(e, dmg * (1 - 0.4 * (d / (radius + e.radius))), origin, knock, attacker)) {
        e.stun = Math.max(e.stun, 0.9); e.windup = 0; e.anim.windup = 0;
      }
    }
  }

  private ai(f: Fighter, dt: number) {
    if (f.stun > 0) { f.stun -= dt; f.anim.speed = 0; return; }
    const t = this.nearestEnemy(f);
    if (!t) { f.anim.speed = 0; return; }
    const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z, dist = Math.hypot(dx, dz) || 1e-4;
    const diff = angDiff(f.yaw, Math.atan2(dx, dz));
    f.yaw += Math.max(-9 * dt, Math.min(9 * dt, diff));
    if (f.windup > 0) {
      f.windup -= dt; f.anim.windup = 1; f.anim.speed = 0;
      if (f.windup <= 0) {
        f.anim.windup = 0; f.anim.punch = 1;
        if (dist <= f.reach + t.radius + 0.4) this.damage(t, f.damage, f.pos, 5.5, f);
        f.atkCd = f.cooldown / f.attackSpeed;
      }
      return;
    }
    f.anim.windup = 0;
    if (dist > f.reach + t.radius - 0.2) {
      const step = f.speed * dt;
      f.pos.x += (dx / dist) * step; f.pos.z += (dz / dist) * step;
      f.anim.speed = Math.min(1, f.speed / 3.5);
    } else {
      f.anim.speed = 0;
      if (f.atkCd <= 0) f.windup = f.windupTime / f.attackSpeed;
    }
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    for (const f of this.fighters) {
      if (f.hp <= 0) { f.anim.dead = true; continue; }
      f.atkCd = Math.max(0, f.atkCd - dt);
      if (!f.isPlayer) {
        if (!f.manual) this.ai(f, dt);
        f.pos.x += f.vel.x * dt; f.pos.z += f.vel.z * dt;
        const k = Math.pow(0.86, dt * 60);
        f.vel.x *= k; f.vel.z *= k;
      }
    }
    // soft separation so nobody stands inside anybody else
    const live = this.fighters.filter((f) => f.hp > 0);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d >= min || d < 1e-4) continue;
      const push = (min - d) / d;
      if (a.isPlayer) { b.pos.x += dx * push; b.pos.z += dz * push; }
      else if (b.isPlayer) { a.pos.x -= dx * push; a.pos.z -= dz * push; }
      else { a.pos.x -= dx * push * 0.5; a.pos.z -= dz * push * 0.5; b.pos.x += dx * push * 0.5; b.pos.z += dz * push * 0.5; }
    }
    if (this.rect) {
      const r = this.rect;
      for (const f of live) {
        if (f.isPlayer) continue;
        f.pos.x = Math.max(r.minX, Math.min(r.maxX, f.pos.x)); f.pos.z = Math.max(r.minZ, Math.min(r.maxZ, f.pos.z));
      }
    }
    if (this.bounds) {
      const { x, z, r } = this.bounds;
      for (const f of live) {
        if (f.isPlayer) continue;
        const dx = f.pos.x - x, dz = f.pos.z - z, d = Math.hypot(dx, dz);
        if (d > r) { f.pos.x = x + (dx / d) * r; f.pos.z = z + (dz / d) * r; }
      }
    }
  }
}

/* ------------------------------------------------------------------ MeastMode */
export const MEAST_MODE = {
  duration: 5,
  damageMult: 3,
  speedMult: 1.5,
  attackSpeed: 2,
  startSlam: { radius: 6, damage: 28 },
  endSlam: { radius: 8, damage: 45 },
};

export interface MeastModeState {
  active: boolean;
  endsAt: number;
  base: { damage: number; speed: number; attackSpeed: number } | null;
}
export const newMeastModeState = (): MeastModeState => ({ active: false, endsAt: 0, base: null });

/**
 * MeastMode(): "I don't shake. I MEAST."
 * 5 seconds of invincibility (super-saiyan aura), x3 damage, faster, with a ground slam as it starts
 * and a bigger one as it ends. Returns false if it can't start.
 */
export function MeastMode(world: CombatWorld, meast: Fighter, st: MeastModeState, now = world.time): boolean {
  if (st.active || meast.hp <= 0) return false;
  st.active = true;
  st.endsAt = now + MEAST_MODE.duration;
  st.base = { damage: meast.damage, speed: meast.speed, attackSpeed: meast.attackSpeed };
  meast.invincible = true;
  meast.damage *= MEAST_MODE.damageMult;
  meast.speed *= MEAST_MODE.speedMult;
  meast.attackSpeed = MEAST_MODE.attackSpeed;
  meast.anim.special = 1;
  meast.anim.slam = 1;
  meast.stun = 0;
  world.slam(meast.pos, MEAST_MODE.startSlam.radius, MEAST_MODE.startSlam.damage, meast.team, 11, meast);
  return true;
}

/** Call every frame. Ends the mode (with the finishing slam) when the timer runs out. */
export function updateMeastMode(world: CombatWorld, meast: Fighter, st: MeastModeState, now = world.time) {
  if (!st.active) return;
  meast.anim.special = 1;
  if (now < st.endsAt) return;
  st.active = false;
  if (st.base) { meast.damage = st.base.damage; meast.speed = st.base.speed; meast.attackSpeed = st.base.attackSpeed; }
  meast.invincible = false;
  meast.anim.special = 0;
  meast.anim.slam = 1;
  world.slam(meast.pos, MEAST_MODE.endSlam.radius, MEAST_MODE.endSlam.damage, meast.team, 14, meast);
}

export const meastModeLeft = (st: MeastModeState, now: number) => (st.active ? Math.max(0, st.endsAt - now) : 0);
