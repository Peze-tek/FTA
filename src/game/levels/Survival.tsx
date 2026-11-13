'use client';
/**
 * SURVIVAL MODE — endless waves of Rugpull's crew on Fap City's Lagos Market street (the Level 1 environment).
 * No price, no objectives: the only score is KILLS. Jack starts with a pistol; four more weapons
 * (SMG, shotgun, rifle, railgun) sit in crates along the street. Walk over one to take it, swap with
 * Q / X / Tab / mouse wheel / 1-5 (or the on-screen weapon bar). Crates respawn as ammo resupply.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { WORLD, WORLD_FULL, AVENUES_Z, CROSS_X, RING_X, ISLAND } from '@/game/data/districts';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import ThirdPersonController from '@/components/ThirdPersonController';
import RugStaff from '@/game/world/RugStaff';
import Character from '@/game/characters/Character';
import City from '@/game/world/City';
import { PlayerLight, FogLayers } from '@/game/world/Atmosphere';
import { BOX, glow, toon } from '@/game/materials';
import { CombatWorld, makeFighter, type Fighter } from '@/lib/CombatSystem';
import { CREW, Crew, makeCrew, type CrewRole } from '@/lib/GunSystem';
import {
  WEAPONS, WEAPON_ORDER, cycle, fire, holster, punchFists, newArsenal, pickup, resupply, reserveOf, select, updateArsenal,
  type Arsenal, type WeaponId,
} from '@/lib/WeaponSystem';
import { consume, input, moveVec, type PressName } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { resolveCircle } from '@/lib/colliders';
import { useGame, loadSurvivalBest, saveSurvivalBest } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { clearNav, nav, cityLabels, islandRects } from '@/lib/nav';
import { sfx } from '@/lib/audio';
import { newCombo, comboKill, comboTick, comboHud } from '@/lib/combo';

export const ROLL_CD = 0.9, ROLL_TIME = 0.4;
/** Play area: the Lagos Market street. */
const AREA = { minX: ISLAND.minX + 3, maxX: ISLAND.maxX - 3, minZ: -(ISLAND.halfZ - 3), maxZ: ISLAND.halfZ - 3 };
const STREETS_Z = [0, ...AVENUES_Z];
const POOL: Record<CrewRole, number> = { grunt: 10, shooter: 5, brute: 3 };
const LABEL: Record<CrewRole, string> = { grunt: 'GOON', shooter: 'GUNMAN', brute: 'ENFORCER' };
export const RESPAWN = 45;

/** Weapon crates, spread along the street. */
const CRATES: { id: string; w: WeaponId; x: number; z: number }[] = [
  { id: 'c-smg', w: 'smg', x: -36, z: -1 },
  { id: 'c-rifle', w: 'rifle', x: -14, z: -3.5 },
  { id: 'c-shotgun', w: 'shotgun', x: 16, z: 4 },
  { id: 'c-sniper', w: 'sniper', x: 38, z: -2 },
  { id: 'c-smg2', w: 'smg', x: 105, z: 3 },
  { id: 'c-shotgun2', w: 'shotgun', x: 170, z: -3.5 },
  { id: 'c-rifle2', w: 'rifle', x: 235, z: 3 },
  { id: 'c-smg3', w: 'smg', x: 295, z: -2 },
  { id: 'c-sniper2', w: 'sniper', x: 340, z: 3 },
];

interface Slot { f: Fighter; role: CrewRole; active: boolean; counted: boolean; deadT: number }
export interface Tracer { x1: number; z1: number; x2: number; z2: number; life: number; max: number; color: string }

/** What a wave contains. Capped by the pool so a wave never exceeds what can be on screen. */
export function waveMix(w: number): Record<CrewRole, number> {
  return {
    grunt: Math.min(POOL.grunt, 3 + w),
    shooter: w >= 3 ? Math.min(POOL.shooter, 1 + Math.floor((w - 3) / 2)) : 0,
    brute: w >= 5 ? Math.min(POOL.brute, 1 + Math.floor((w - 5) / 3)) : 0,
  };
}

/* --------------------------------------------------------------------- views */
function SlotView({ slot }: { slot: Slot }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const f = slot.f;
    g.current.visible = slot.active && (f.hp > 0 || slot.deadT < 3.2);
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
  });
  return <group ref={g} visible={false}><Character kind={slot.f.kind} anim={slot.f.ref} label={LABEL[slot.role]} /></group>;
}

/** Glowing weapon crate with a beacon and name tag. */
export function Crate({ def, taken }: { def: (typeof CRATES)[number]; taken: MutableRefObject<Record<string, number>> }) {
  const g = useRef<THREE.Group>(null!);
  const gun = useRef<THREE.Group>(null!);
  const W = WEAPONS[def.w];
  useFrame(({ clock }) => {
    const t = taken.current[def.id] ?? 0;
    g.current.visible = t <= 0;
    gun.current.rotation.y = clock.elapsedTime * 1.4;
    gun.current.position.y = 1.35 + Math.sin(clock.elapsedTime * 3) * 0.12;
  });
  return (
    <group ref={g} position={[def.x, 0, def.z]}>
      <mesh geometry={BOX} material={toon('#27272a')} position={[0, 0.35, 0]} scale={[1.3, 0.7, 0.9]} />
      <mesh geometry={BOX} material={glow(W.color)} position={[0, 0.72, 0]} scale={[1.34, 0.06, 0.94]} />
      <group ref={gun}><HeldModel id={def.w} scale={1.2} /></group>
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 10, 10, 1, true]} />
        <meshBasicMaterial color={W.color} transparent opacity={0.2} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <Html position={[0, 2.5, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-game text-[10px] tracking-widest" style={{ color: W.color }}>{W.icon} {W.name}</div>
      </Html>
    </group>
  );
}

const MUZZLE: Record<WeaponId, number> = { pistol: 0.55, smg: 0.62, shotgun: 1.0, rifle: 0.95, sniper: 1.2 };
/** Low-poly model per weapon (local +Z = muzzle). */
function HeldModel({ id, scale = 1 }: { id: WeaponId; scale?: number }) {
  const dark = toon('#111827'), grey = toon('#374151'), wood = toon('#7c4a1e');
  const accent = glow(WEAPONS[id].color);
  return (
    <group scale={scale}>
      {id === 'pistol' && (<>
        <mesh geometry={BOX} material={dark} position={[0, 0, 0.18]} scale={[0.08, 0.1, 0.42]} />
        <mesh geometry={BOX} material={dark} position={[0, -0.1, 0.05]} scale={[0.08, 0.16, 0.1]} />
      </>)}
      {id === 'smg' && (<>
        <mesh geometry={BOX} material={dark} position={[0, 0, 0.22]} scale={[0.1, 0.14, 0.56]} />
        <mesh geometry={BOX} material={grey} position={[0, -0.17, 0.14]} scale={[0.06, 0.24, 0.08]} />
        <mesh geometry={BOX} material={accent} position={[0, 0.08, 0.3]} scale={[0.04, 0.03, 0.3]} />
      </>)}
      {id === 'shotgun' && (<>
        <mesh geometry={BOX} material={grey} position={[0, 0, 0.45]} scale={[0.09, 0.09, 0.95]} />
        <mesh geometry={BOX} material={wood} position={[0, -0.07, 0.35]} scale={[0.12, 0.1, 0.28]} />
        <mesh geometry={BOX} material={wood} position={[0, -0.04, -0.08]} scale={[0.1, 0.16, 0.34]} />
        <mesh geometry={BOX} material={accent} position={[0, 0.06, 0.88]} scale={[0.03, 0.03, 0.04]} />
      </>)}
      {id === 'rifle' && (<>
        <mesh geometry={BOX} material={dark} position={[0, 0, 0.32]} scale={[0.1, 0.13, 0.9]} />
        <mesh geometry={BOX} material={grey} position={[0, -0.16, 0.2]} scale={[0.07, 0.22, 0.1]} />
        <mesh geometry={BOX} material={dark} position={[0, -0.03, -0.2]} scale={[0.09, 0.16, 0.3]} />
        <mesh geometry={BOX} material={accent} position={[0, 0.1, 0.4]} scale={[0.04, 0.05, 0.2]} />
      </>)}
      {id === 'sniper' && (<>
        <mesh geometry={BOX} material={dark} position={[0, 0, 0.5]} scale={[0.09, 0.1, 1.2]} />
        <mesh geometry={BOX} material={grey} position={[0, 0.12, 0.35]} scale={[0.08, 0.1, 0.34]} />
        <mesh geometry={BOX} material={accent} position={[0, 0, 0.5]} scale={[0.11, 0.03, 1.0]} />
        <mesh geometry={BOX} material={dark} position={[0, -0.04, -0.2]} scale={[0.09, 0.18, 0.36]} />
      </>)}
    </group>
  );
}

/** Jack's current weapon, muzzle flash, tracers; enemy bullets. */
export function ArmsFx({ jake, arm, crew, tracers, flash, hide }: {
  jake: Fighter; arm: Arsenal; crew: Crew; tracers: MutableRefObject<Tracer[]>; flash: MutableRefObject<number>; hide?: MutableRefObject<boolean>;
}) {
  const hold = useRef<THREE.Group>(null!);
  const models = useRef<Record<string, THREE.Group | null>>({});
  const muzzle = useRef<THREE.Mesh>(null!);
  const tr = useRef<(THREE.Mesh | null)[]>([]);
  const bl = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    hold.current.visible = jake.hp > 0 && !hide?.current && !arm.unarmed;
    {
      const an = jake.ref.current, kick = (an.recoil ?? 0) * 0.1, fw = 0.66 - kick, rt = 0.05;
      an.armed = arm.unarmed ? 0 : arm.cur === 'pistol' || arm.cur === 'smg' ? 1 : 2;
      hold.current.position.set(playerState.pos.x + Math.cos(jake.yaw) * rt + Math.sin(jake.yaw) * fw, 1.4 + (an.recoil ?? 0) * 0.03, playerState.pos.z - Math.sin(jake.yaw) * rt + Math.cos(jake.yaw) * fw);
    }
    hold.current.rotation.y = jake.yaw;
    for (const id of WEAPON_ORDER) { const m = models.current[id]; if (m) m.visible = id === arm.cur; }
    muzzle.current.position.z = MUZZLE[arm.cur];
    flash.current = Math.max(0, flash.current - dt);
    muzzle.current.visible = flash.current > 0;
    muzzle.current.scale.setScalar(arm.cur === 'shotgun' ? 2 : arm.cur === 'sniper' ? 2.4 : 1);
    for (let i = 0; i < 14; i++) {
      const m = tr.current[i]; if (!m) continue;
      const t = tracers.current[i];
      if (t && t.life > 0) {
        t.life -= dt;
        const dx = t.x2 - t.x1, dz = t.z2 - t.z1, len = Math.hypot(dx, dz) || 0.01;
        m.visible = true; m.position.set((t.x1 + t.x2) / 2, 1.15, (t.z1 + t.z2) / 2);
        m.lookAt(t.x2, 1.15, t.z2);
        const w = t.max > 0.1 ? 0.14 * (t.life / t.max) + 0.03 : 0.05;
        m.scale.set(w, w, len);
        (m.material as THREE.MeshBasicMaterial).color.set(t.color);
      } else m.visible = false;
    }
    for (let i = 0; i < 16; i++) {
      const m = bl.current[i]; if (!m) continue;
      const b = crew.bullets[i];
      if (b) { m.visible = true; m.position.set(b.x, 1.1, b.z); } else m.visible = false;
    }
  });
  return (<>
    <group ref={hold}>
      {WEAPON_ORDER.map((id) => <group key={id} ref={(g) => { models.current[id] = g; }} visible={false}><HeldModel id={id} /></group>)}
      <mesh ref={muzzle} position={[0, 0, 0.55]} visible={false}><octahedronGeometry args={[0.2, 0]} /><meshBasicMaterial color="#ffe08a" toneMapped={false} /></mesh>
    </group>
    {Array.from({ length: 14 }).map((_, i) => (
      <mesh key={'t' + i} ref={(m) => { tr.current[i] = m; }} geometry={BOX} visible={false}><meshBasicMaterial color="#fff3a0" toneMapped={false} /></mesh>
    ))}
    {Array.from({ length: 16 }).map((_, i) => (
      <mesh key={'b' + i} ref={(m) => { bl.current[i] = m; }} visible={false}>
        <sphereGeometry args={[0.22, 8, 6]} /><meshBasicMaterial color="#ff2d55" toneMapped={false} />
      </mesh>
    ))}
  </>);
}

/* --------------------------------------------------------------------- scene */
export default function Survival() {
  const world = useMemo(() => new CombatWorld(), []);
  const { jake, arm, crew, slots } = useMemo(() => {
    const jake = makeFighter({ id: 'jake', label: 'JACK', team: 'heroes', kind: 'jake', isPlayer: true, hp: 120, maxHp: 120, radius: 0.45, damage: 6 });
    jake.pos.set(0, 0, 4); jake.yaw = Math.PI;
    world.add(jake);
    world.rect = { ...AREA };
    const slots: Slot[] = [];
    (Object.keys(POOL) as CrewRole[]).forEach((role) => {
      for (let i = 0; i < POOL[role]; i++) {
        const f = makeCrew(`${role}${i}`, role, LABEL[role]);
        f.hp = 0; f.anim.dead = true;
        world.add(f);
        slots.push({ f, role, active: false, counted: true, deadT: 99 });
      }
    });
    return { jake, arm: newArsenal(), crew: new Crew(world, jake), slots };
  }, [world]);

  const lock = useMemo(() => new THREE.Vector3(), []);
  const tracers = useRef<Tracer[]>([]);
  const flash = useRef(0);
  const fireQ = useRef(false);
  const hasTarget = useRef(false);
  const cb = useRef(newCombo());
  const aimT = useRef(0);          // >0 shortly after firing: body auto-aims at the nearest enemy (camera stays free, like Level 1)
  const taken = useRef<Record<string, number>>({});
  const S = useRef({
    started: false, ended: false, hudT: 0, roll: 0, rollCd: 0, navT: 0, lastMag: 12,
    wave: 0, kills: 0, best: 0, total: 0, wait: 2.6,
  });

  const spawnWave = (w: number) => {
    const s = S.current, mix = waveMix(w);
    const hpMul = Math.min(2.2, 1 + 0.05 * (w - 1)), dmgMul = Math.min(1.6, 1 + 0.03 * (w - 1));
    let n = 0;
    (Object.keys(mix) as CrewRole[]).forEach((role) => {
      let left = mix[role];
      for (const sl of slots) {
        if (left <= 0) break;
        if (sl.role !== role || (sl.active && !(sl.f.hp <= 0 && sl.deadT > 2.5))) continue;
        const f = sl.f, base = CREW[role];
        const p = { x: 0, z: 0 };
        for (let t = 0; t < 10; t++) {
          // anywhere in the open city, 16-34 m from Jack
          p.x = Math.max(AREA.minX + 1, Math.min(AREA.maxX - 1, jake.pos.x + (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 18)));
          { const st = STREETS_Z.reduce((a, b) => (Math.abs(b - jake.pos.z) < Math.abs(a - jake.pos.z) ? b : a)); p.z = st + (Math.random() * 2 - 1) * 4; }
          if (Math.hypot(p.x - jake.pos.x, p.z - jake.pos.z) > 14) break;
        }
        resolveCircle(p, f.radius);
        f.maxHp = Math.round(base.hp * hpMul); f.hp = f.maxHp;
        f.damage = Math.round(base.damage * dmgMul * 10) / 10;
        f.pos.set(p.x, 0, p.z); f.vel.set(0, 0, 0); f.yaw = Math.atan2(jake.pos.x - p.x, jake.pos.z - p.z);
        f.stun = 0; f.windup = 0; f.atkCd = 0.8 + Math.random() * 0.6;
        f.anim.dead = false; f.anim.hit = 0; f.anim.windup = 0; f.anim.punch = 0; f.anim.speed = 0;
        sl.active = true; sl.counted = false; sl.deadT = 0;
        left--; n++;
      }
    });
    s.total = n;
    const g = useGame.getState();
    g.showBanner(`WAVE ${w}`, 1800); sfx.warn();
    g.setSurvival({ wave: w });
  };
  const alive = () => slots.filter((sl) => sl.active && sl.f.hp > 0).length;

  useEffect(() => {
    nav.range = 55;
    nav.rects = [
      ...islandRects(),
      { x: (WORLD_FULL.minX + WORLD_FULL.maxX) / 2, z: 0, w: WORLD_FULL.maxX - WORLD_FULL.minX, d: 16, color: '#46445c' },
      ...AVENUES_Z.map((z) => ({ x: (WORLD_FULL.minX + WORLD_FULL.maxX) / 2, z, w: WORLD_FULL.maxX - WORLD_FULL.minX, d: 14, color: '#46445c' })),
      ...[...RING_X, ...CROSS_X].map((x) => ({ x, z: 0, w: 12, d: WORLD_FULL.halfZ * 2, color: '#46445c' })),
    ];
    nav.markers = []; nav.target = null; nav.labels = cityLabels(true); nav.sea = true;
    const best = loadSurvivalBest();
    S.current.best = best;
    const g0 = useGame.getState();
    g0.setObjective('');
    g0.setSurvival({ kills: 0, wave: 0, best, left: 0 });
    g0.setFight({
      hp: jake.hp, maxHp: jake.maxHp, rage: 0, meastLeft: 0, ally: 1, phase: 0, prompt: null,
      stage: 'SURVIVAL', gun: true, ammo: 12, mag: 12, reload: false, foes: [], weapon: 'PISTOL', reserve: -1,
    });
    world.onHit = (e) => { if (e.target === jake && !e.blocked) haptic.impact(e.big ? 'heavy' : 'medium'); };
    crew.onFire = () => sfx.shot(true);
    crew.onHitJake = () => haptic.notify('error');
    g0.say([
      { who: 'TEK', text: `${g0.playerName ? g0.playerName + ', ' : ''}no price, no plan — just Lagos Market and Rugpull's crew. Only KILLS count.`, color: '#38bdf8' },
      { who: 'ROBOFAP', text: 'I stashed weapon crates along the street: SMG, shotgun, rifle, railgun. Walk over one to grab it. Swap with Q / X / Tab / mouse wheel / keys 1-5, or tap the weapon bar.', color: '#22d3ee' },
    ], () => { S.current.started = true; });
    return () => {
      world.onHit = undefined; crew.onFire = undefined; crew.onHitJake = undefined; playerState.locked = false;
      const s = useGame.getState(); s.setPrompt(null); s.setFight({ foes: [], prompt: null, gun: false }); clearNav();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPunch = () => { fireQ.current = true; };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const s = S.current;

    // camera lock: nearest live enemy (else straight ahead)
    {
      let best: Fighter | null = null, bd = Infinity;
      for (const e of world.enemiesOf(jake)) {
        const d = Math.hypot(e.pos.x - jake.pos.x, e.pos.z - jake.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      hasTarget.current = !!best;
      if (best) lock.set(best.pos.x, 1, best.pos.z);
    }
    if (g.cutscene || g.dialogue || g.gameOver || s.ended || !s.started) { fireQ.current = false; return; }

    jake.pos.set(playerState.pos.x, 0, playerState.pos.z);
    jake.yaw = playerState.facing;
    updateArsenal(arm, dt);

    // ---- weapon swap
    if (consume('swap') || consume('special')) {
      if (cycle(arm, 1)) { sfx.swap(); haptic.impact('light'); }
      else g.toast('Find weapon crates along the street!', 'info');
    }
    if (consume('slot0') && holster(arm)) { sfx.swap(); haptic.impact('light'); }
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (!consume(`slot${i + 1}` as PressName)) continue;
      const id = WEAPON_ORDER[i];
      if (select(arm, id)) { sfx.swap(); haptic.impact('light'); }
      else if (!arm.slots[id].has) g.toast(`${WEAPONS[id].name} not found yet — check the crates`, 'info');
    }

    // ---- weapon crates (walk over to pick up; respawn as ammo)
    for (const c of CRATES) {
      const t = taken.current[c.id] ?? 0;
      if (t > 0) { taken.current[c.id] = Math.max(0, t - dt); continue; }
      if (Math.hypot(jake.pos.x - c.x, jake.pos.z - c.z) > 1.9) continue;
      const r = pickup(arm, c.w);
      taken.current[c.id] = RESPAWN;
      haptic.notify('success');
      if (r === 'new') { sfx.weaponGet(); g.toast(`${WEAPONS[c.w].icon} ${WEAPONS[c.w].name} ACQUIRED`, 'good'); g.showBanner(WEAPONS[c.w].name, 1200); }
      else { sfx.pickup(); g.toast(r === 'full' ? `${WEAPONS[c.w].name} ammo already full` : `+ ${WEAPONS[c.w].name} AMMO`, 'good'); }
    }

    // ---- shooting (hold to auto-fire; taps/clicks queue one shot)
    const want = fireQ.current || input.held.fire;
    aimT.current = want ? 0.7 : Math.max(0, aimT.current - dt);
    fireQ.current = false;
    if (want) {
      const r = arm.unarmed ? punchFists(arm, world, jake) : fire(arm, world, jake);
      if (r) {
        if (r.dry) sfx.empty();
        else {
          sfx.gun(r.weapon); haptic.impact('light');
          flash.current = 0.06; jake.ref.current.recoil = 1;
          const col = WEAPONS[r.weapon].color;
          for (const ray of r.rays) {
            const t = tracers.current;
            const tr: Tracer = { x1: ray.from.x, z1: ray.from.z, x2: ray.to.x, z2: ray.to.z, life: r.weapon === 'sniper' ? 0.18 : 0.07, max: r.weapon === 'sniper' ? 0.18 : 0.07, color: r.weapon === 'pistol' ? '#fff3a0' : col };
            const slot = t.findIndex((q) => q.life <= 0);
            if (slot >= 0) t[slot] = tr; else if (t.length < 14) t.push(tr); else t[0] = tr;
          }
          if (r.weapon === 'shotgun') { playerState.impulse.x -= Math.sin(r.yaw) * 4; playerState.impulse.z -= Math.cos(r.yaw) * 4; }
        }
      }
    }
    // reload sound when a reload starts
    const mag = arm.slots[arm.cur].mag;
    if (arm.reload > 0 && s.lastMag > 0 && mag === 0) sfx.reload();
    s.lastMag = arm.reload > 0 ? 0 : mag;

    // ---- dodge roll
    s.rollCd = Math.max(0, s.rollCd - dt);
    if (s.roll > 0) { s.roll -= dt; if (s.roll <= 0) jake.invincible = false; }
    if (consume('dodge') && s.rollCd <= 0) {
      const m = moveVec(), yw = playerState.yaw;
      let dx = -Math.sin(yw) * m.y + Math.cos(yw) * m.x, dz = -Math.cos(yw) * m.y - Math.sin(yw) * m.x;
      if (m.mag < 0.15) { const bx = lock.x - jake.pos.x, bz = lock.z - jake.pos.z, bd = Math.hypot(bx, bz) || 1; dx = bz / bd; dz = -bx / bd; }
      const dl = Math.hypot(dx, dz) || 1;
      playerState.impulse.x += (dx / dl) * 22; playerState.impulse.z += (dz / dl) * 22;
      jake.invincible = true; s.roll = ROLL_TIME; s.rollCd = ROLL_CD; haptic.impact('light'); sfx.dodge();
    }
    consume('grab');

    // ---- simulate
    world.update(dt);
    for (const sl of slots) if (sl.active && sl.f.hp > 0) resolveCircle(sl.f.pos, sl.f.radius);   // enemies respect buses, stalls, walls
    crew.update(dt, playerState.pos.y);
    playerState.impulse.x += jake.vel.x; playerState.impulse.z += jake.vel.z; jake.vel.set(0, 0, 0);
    playerState.pos.x = Math.max(AREA.minX, Math.min(AREA.maxX, playerState.pos.x));
    playerState.pos.z = Math.max(AREA.minZ, Math.min(AREA.maxZ, playerState.pos.z));

    // ---- kill counting + corpse timers
    comboTick(cb.current, dt);
    for (const sl of slots) {
      if (!sl.active) continue;
      if (sl.f.hp <= 0) {
        sl.deadT += dt;
        if (!sl.counted) {
          sl.counted = true; sl.deadT = 0; s.kills++;
          if (s.kills > s.best) { s.best = s.kills; saveSurvivalBest(s.best); }
          const lbl = comboKill(cb.current);
          if (lbl) { g.showBanner(lbl, 1100); haptic.notify('success'); sfx.comboHit(cb.current.n); }
          if (cb.current.n >= 3) { jake.hp = Math.min(jake.maxHp, jake.hp + 4); }
          useGame.getState().setSurvival({ kills: s.kills, best: s.best, ...comboHud(cb.current) });
        }
      }
    }

    // ---- wave flow
    if (s.wave === 0 || alive() === 0) {
      s.wait -= dt;
      if (s.wait <= 0) {
        if (s.wave > 0) {
          jake.hp = Math.min(jake.maxHp, jake.hp + 30); resupply(arm);
          g.toast('+30 HP · ammo resupplied', 'good');
        }
        s.wave++; s.wait = 3.2; spawnWave(s.wave);
      } else if (s.wave > 0 && s.wait > 2.9) {
        g.showBanner('WAVE CLEARED', 1500);
      }
    }

    // ---- minimap markers + HUD (10 Hz)
    s.navT += dt;
    if (s.navT > 0.2) {
      s.navT = 0;
      const mk: { x: number; z: number; color: string; kind: 'poi' | 'enemy' }[] = [];
      for (const sl of slots) if (sl.active && sl.f.hp > 0) mk.push({ x: sl.f.pos.x, z: sl.f.pos.z, color: '#ff2d55', kind: 'enemy' });
      for (const c of CRATES) if ((taken.current[c.id] ?? 0) <= 0) mk.push({ x: c.x, z: c.z, color: WEAPONS[c.w].color, kind: 'poi' });
      nav.markers = mk;
    }
    s.hudT += dt;
    if (s.hudT > 0.1) {
      s.hudT = 0;
      const left = alive(), d = WEAPONS[arm.cur], slot = arm.slots[arm.cur], res = reserveOf(arm);
      g.setSurvival({
        left, cur: arm.unarmed ? -1 : WEAPON_ORDER.indexOf(arm.cur), ...comboHud(cb.current),
        arms: WEAPON_ORDER.map((id) => ({
          id, name: WEAPONS[id].name, icon: WEAPONS[id].icon, color: WEAPONS[id].color,
          has: arm.slots[id].has, mag: arm.slots[id].mag, reserve: WEAPONS[id].maxReserve < 0 ? -1 : arm.slots[id].reserve,
        })),
      });
      g.setFight({
        hp: Math.ceil(jake.hp), maxHp: jake.maxHp, stage: 'SURVIVAL', prompt: null,
        gun: true, ammo: slot.mag, mag: d.mag, reload: arm.reload > 0, weapon: arm.unarmed ? 'FISTS' : d.name, reserve: res === Infinity ? -1 : res,
        foes: s.total > 0 ? [{ id: 'wave', name: left > 0 ? `WAVE ${s.wave} — ${left} LEFT` : `WAVE ${s.wave} CLEARED`, hp: left, max: s.total }] : [],
      });
    }

    // ---- death
    if (jake.hp <= 0) {
      s.ended = true; jake.anim.dead = true; jake.anim.speed = 0; haptic.notify('error');
      saveSurvivalBest(Math.max(s.best, s.kills));
      setTimeout(() => useGame.getState().setGameOver('REKT'), 900);
    }
  });

  return (
    <>
      <City openAll />
      <PlayerLight />
      <FogLayers />
      {CRATES.map((c) => <Crate key={c.id} def={c} taken={taken} />)}
      {slots.map((sl) => <SlotView key={sl.f.id} slot={sl} />)}
      <ArmsFx jake={jake} arm={arm} crew={crew} tracers={tracers} flash={flash} />
      <RugStaff openAll />
      <ThirdPersonController
        spawn={[0, 0, 4]} anim={jake.anim} startYaw={0}
        aimAt={() => (hasTarget.current && aimT.current > 0 ? lock : null)}
        canPunch
        onPunch={onPunch}
      />
    </>
  );
}
