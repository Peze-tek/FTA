/**
 * WeaponSystem — Survival mode arsenal (pure TS, headless-testable).
 * Five hitscan weapons with their own magazine, reserve ammo, fire rate, spread and damage.
 * Jack carries every weapon he has picked up and can swap between them.
 */
import { CombatWorld, type Fighter } from '@/lib/CombatSystem';

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper';
export const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];

export interface WeaponDef {
  id: WeaponId; name: string; icon: string; color: string;
  mag: number;
  reserve: number;      // ammo granted by a pickup (on top of a full mag the first time)
  maxReserve: number;   // -1 = infinite
  damage: number;       // per pellet
  cooldown: number; reload: number;
  range: number; cone: number;   // auto-aim cone (rad)
  pellets: number; spread: number;
  auto: boolean; pierce: boolean; knock: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { id: 'pistol',  name: 'PISTOL',  icon: '🔫', color: '#e5e7eb', mag: 12, reserve: 0,  maxReserve: -1,  damage: 14, cooldown: 0.28, reload: 1.2, range: 30, cone: 0.7,  pellets: 1, spread: 0,    auto: false, pierce: false, knock: 2.2 },
  smg:     { id: 'smg',     name: 'SMG',     icon: '⚡', color: '#22d3ee', mag: 30, reserve: 60, maxReserve: 150, damage: 8,  cooldown: 0.075, reload: 1.5, range: 26, cone: 0.6,  pellets: 1, spread: 0.07, auto: true,  pierce: false, knock: 0.8 },
  shotgun: { id: 'shotgun', name: 'SHOTGUN', icon: '💥', color: '#fb923c', mag: 6,  reserve: 18, maxReserve: 36,  damage: 12, cooldown: 0.85, reload: 1.8, range: 14, cone: 0.7,  pellets: 8, spread: 0.22, auto: false, pierce: false, knock: 5.5 },
  rifle:   { id: 'rifle',   name: 'RIFLE',   icon: '🎯', color: '#39ff88', mag: 24, reserve: 48, maxReserve: 120, damage: 17, cooldown: 0.13, reload: 1.8, range: 40, cone: 0.55, pellets: 1, spread: 0.03, auto: true,  pierce: false, knock: 1.6 },
  sniper:  { id: 'sniper',  name: 'RAILGUN', icon: '🔆', color: '#ff4fd8', mag: 5,  reserve: 10, maxReserve: 25,  damage: 85, cooldown: 1.0,  reload: 2.2, range: 60, cone: 0.5,  pellets: 1, spread: 0,    auto: false, pierce: true,  knock: 7 },
};

export interface WeaponSlot { has: boolean; mag: number; reserve: number }
export interface Arsenal {
  slots: Record<WeaponId, WeaponSlot>;
  cur: WeaponId; reload: number; cd: number;
}

export function newArsenal(): Arsenal {
  const slots = {} as Record<WeaponId, WeaponSlot>;
  for (const id of WEAPON_ORDER) slots[id] = { has: false, mag: WEAPONS[id].mag, reserve: 0 };
  slots.pistol.has = true;
  return { slots, cur: 'pistol', reload: 0, cd: 0 };
}

export const owned = (a: Arsenal) => WEAPON_ORDER.filter((id) => a.slots[id].has);
export const reserveOf = (a: Arsenal, id: WeaponId = a.cur) => (WEAPONS[id].maxReserve < 0 ? Infinity : a.slots[id].reserve);

/** Walk over a crate: new weapon (auto-equips) or ammo for one you already have. Returns what happened. */
export function pickup(a: Arsenal, id: WeaponId): 'new' | 'ammo' | 'full' {
  const d = WEAPONS[id], s = a.slots[id];
  if (!s.has) {
    s.has = true; s.mag = d.mag; s.reserve = d.reserve;
    select(a, id, true);
    return 'new';
  }
  if (d.maxReserve < 0 || s.reserve >= d.maxReserve) { s.mag = d.mag; return d.maxReserve < 0 ? 'ammo' : 'full'; }
  s.reserve = Math.min(d.maxReserve, s.reserve + d.reserve);
  return 'ammo';
}

export function select(a: Arsenal, id: WeaponId, force = false): boolean {
  if (!a.slots[id].has || (id === a.cur && !force)) return false;
  a.cur = id; a.reload = 0; a.cd = Math.max(a.cd, 0.22);
  return true;
}
export function cycle(a: Arsenal, dir: 1 | -1 = 1): WeaponId | null {
  const list = owned(a);
  if (list.length < 2) return null;
  const i = list.indexOf(a.cur);
  const next = list[(i + dir + list.length) % list.length];
  select(a, next);
  return next;
}

export function startReload(a: Arsenal): boolean {
  const d = WEAPONS[a.cur], s = a.slots[a.cur];
  if (a.reload > 0 || s.mag >= d.mag || reserveOf(a) <= 0) return false;
  a.reload = d.reload;
  return true;
}

export function updateArsenal(a: Arsenal, dt: number) {
  a.cd = Math.max(0, a.cd - dt);
  if (a.reload > 0) {
    a.reload -= dt;
    if (a.reload <= 0) {
      a.reload = 0;
      const d = WEAPONS[a.cur], s = a.slots[a.cur];
      const need = d.mag - s.mag, take = Math.min(need, reserveOf(a));
      s.mag += take;
      if (d.maxReserve >= 0) s.reserve -= take;
    }
  }
}

/** Between waves: full mags + a reserve top-up for everything you carry. */
export function resupply(a: Arsenal) {
  for (const id of WEAPON_ORDER) {
    const s = a.slots[id], d = WEAPONS[id];
    if (!s.has) continue;
    s.mag = d.mag;
    if (d.maxReserve >= 0) s.reserve = Math.min(d.maxReserve, s.reserve + Math.ceil(d.reserve * 0.5));
  }
  a.reload = 0;
}

const angDiff = (x: number, y: number) => {
  let d = (y - x) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface Ray { from: { x: number; z: number }; to: { x: number; z: number }; hits: Fighter[] }
export interface FireResult { rays: Ray[]; yaw: number; weapon: WeaponId; dry?: boolean }

/** Pull the trigger. Auto-aims inside the weapon's cone; fires every pellet; railgun pierces. null = couldn't fire. */
export function fire(a: Arsenal, world: CombatWorld, jake: Fighter): FireResult | null {
  const d = WEAPONS[a.cur], s = a.slots[a.cur];
  if (a.reload > 0 || a.cd > 0) return null;
  if (s.mag <= 0) {
    if (!startReload(a)) { a.cd = 0.3; return { rays: [], yaw: jake.yaw, weapon: a.cur, dry: true }; }
    return null;
  }
  s.mag--; a.cd = d.cooldown;
  if (s.mag <= 0) startReload(a);

  let yaw = jake.yaw, best = Infinity;
  for (const e of world.enemiesOf(jake)) {
    if (e.invincible) continue;
    const dx = e.pos.x - jake.pos.x, dz = e.pos.z - jake.pos.z, dist = Math.hypot(dx, dz);
    if (dist > d.range) continue;
    const ang = Math.abs(angDiff(jake.yaw, Math.atan2(dx, dz)));
    if (ang > d.cone) continue;
    const score = ang * 12 + dist;
    if (score < best) { best = score; yaw = Math.atan2(dx, dz); }
  }
  jake.yaw = yaw;

  const rays: Ray[] = [];
  for (let p = 0; p < d.pellets; p++) {
    const off = d.pellets > 1
      ? ((p / (d.pellets - 1)) * 2 - 1) * d.spread + (Math.random() - 0.5) * 0.05
      : (Math.random() - 0.5) * d.spread;
    const ry = yaw + off, sx = Math.sin(ry), sz = Math.cos(ry);
    const cand: { e: Fighter; t: number }[] = [];
    for (const e of world.enemiesOf(jake)) {
      const dx = e.pos.x - jake.pos.x, dz = e.pos.z - jake.pos.z;
      const t = dx * sx + dz * sz;
      if (t < 0 || t > d.range) continue;
      if (Math.abs(dx * sz - dz * sx) <= e.radius + 0.2) cand.push({ e, t });
    }
    cand.sort((x, y) => x.t - y.t);
    const hits: Fighter[] = [];
    let reach = d.range;
    for (const c of cand) {
      const fall = d.pellets > 1 ? 1 - 0.55 * (c.t / d.range) : 1;     // shotgun loses punch with distance
      if (world.damage(c.e, d.damage * fall, jake.pos, d.knock / d.pellets, jake)) hits.push(c.e);
      if (!d.pierce) { reach = c.t; break; }
    }
    rays.push({ from: { x: jake.pos.x, z: jake.pos.z }, to: { x: jake.pos.x + sx * reach, z: jake.pos.z + sz * reach }, hits });
  }
  return { rays, yaw, weapon: a.cur };
}
