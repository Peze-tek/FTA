'use client';
/**
 * FREE PLAY — the whole Fap City is open. Hop into any car (E near it), run over or shoot Rugpull's crew,
 * grab weapon crates, and clear the crew camps dotted around the districts. No price, no timer.
 *
 *  - Cars: arcade driving (W/S throttle, A/D steer, Shift nitro, Space handbrake, E enter/exit). Rams hurt crew.
 *  - Camps: idle until you come close (or shoot one), then the whole camp rushes you. Cleared camps heal you
 *    and come back after a while. Leave a camp alone and it resets.
 *  - Weapons: same arsenal + crates as Survival (walk over to pick up, 1-5 / Q / X / Tab / wheel to swap).
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import ThirdPersonController from '@/components/ThirdPersonController';
import RugStaff from '@/game/world/RugStaff';
import Character from '@/game/characters/Character';
import City from '@/game/world/City';
import { PlayerLight, FogLayers } from '@/game/world/Atmosphere';
import { SportsCar, CivCar } from '@/game/levels/Level4';
import { ArmsFx, Crate, ROLL_CD, ROLL_TIME, RESPAWN, type Tracer } from '@/game/levels/Survival';
import { BOX, glow, toon } from '@/game/materials';
import { WORLD, ROUTES, rowZ } from '@/game/data/districts';
import { CombatWorld, makeFighter, type Fighter } from '@/lib/CombatSystem';
import { CREW, Crew, makeCrew, type CrewRole } from '@/lib/GunSystem';
import {
  WEAPONS, WEAPON_ORDER, cycle, fire, newArsenal, pickup, resupply, reserveOf, select, updateArsenal, type WeaponId,
} from '@/lib/WeaponSystem';
import { consume, input, moveVec, type PressName } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { resolveCircle } from '@/lib/colliders';
import { useGame, loadFreeBest, saveFreeBest } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { clearNav, nav } from '@/lib/nav';
import { engine, sfx } from '@/lib/audio';
import { newCombo, comboKill, comboTick, comboHud } from '@/lib/combo';

const AREA = { minX: WORLD.minX + 4, maxX: WORLD.maxX - 4, minZ: -(WORLD.halfZ - 3), maxZ: WORLD.halfZ - 3 };
const LABEL: Record<CrewRole, string> = { grunt: 'GOON', shooter: 'GUNMAN', brute: 'ENFORCER' };

/* ------------------------------------------------------------------ the map */
interface CampDef { id: string; name: string; x: number; z: number; mix: Record<CrewRole, number> }
const CAMPS: CampDef[] = [
  { id: 'k1', name: 'MARKET GANG', x: 48, z: 0, mix: { grunt: 3, shooter: 1, brute: 0 } },
  { id: 'k2', name: 'LONDON NEON CREW', x: 128, z: -2, mix: { grunt: 3, shooter: 2, brute: 0 } },
  { id: 'k3', name: 'PORT HARCOURT MOB', x: 188, z: 2, mix: { grunt: 4, shooter: 2, brute: 1 } },
  { id: 'k4', name: 'FINANCE ENFORCERS', x: 262, z: -2, mix: { grunt: 4, shooter: 2, brute: 1 } },
  { id: 'k5', name: "RUGPULL'S LAST STAND", x: 330, z: 1, mix: { grunt: 3, shooter: 3, brute: 2 } },
  // hideouts down the side-street alleys
  { id: 'k6', name: 'BACK-ALLEY CREW', x: 12, z: -48, mix: { grunt: 3, shooter: 1, brute: 0 } },
  { id: 'k7', name: 'DEEP BLOCK GANG', x: 112, z: -68, mix: { grunt: 3, shooter: 2, brute: 1 } },
  { id: 'k8', name: 'SOUTH LOT SYNDICATE', x: 195, z: 68, mix: { grunt: 4, shooter: 2, brute: 1 } },
];
const _cam = new THREE.Vector3();
const AGGRO = 26, CAMP_RESET = 150;

const CRATES: { id: string; w: WeaponId; x: number; z: number }[] = [
  { id: 'f-smg', w: 'smg', x: -30, z: -2 },
  { id: 'f-shotgun', w: 'shotgun', x: 14, z: 4 },
  { id: 'f-rifle', w: 'rifle', x: 78, z: -3 },
  { id: 'f-sniper', w: 'sniper', x: 110, z: 3 },
  { id: 'f-smg2', w: 'smg', x: 160, z: -3 },
  { id: 'f-shotgun2', w: 'shotgun', x: 214, z: 3.5 },
  { id: 'f-rifle2', w: 'rifle', x: 240, z: -3.5 },
  { id: 'f-sniper2', w: 'sniper', x: 296, z: 3 },
  { id: 'f-rifle3', w: 'rifle', x: 318, z: -3 },
  { id: 'f-shotgun3', w: 'shotgun', x: -6, z: -48 },
  { id: 'f-sniper3', w: 'sniper', x: 98, z: 58 },
  { id: 'f-rifle4', w: 'rifle', x: 124, z: -68 },
  { id: 'f-smg4', w: 'smg', x: 175, z: 68 },
  { id: 'f-shotgun4', w: 'shotgun', x: 222, z: -58 },
];

/** Cars parked around the city: kind 0 = sports car, 1-4 = civilian looks (sedan / taxi / van / pickup). */
interface CarDef { kind: number; color?: string; accent?: string; x: number; z: number; yaw: number }
const FLEET: CarDef[] = [
  { kind: 0, color: '#ff2d55', accent: '#ffd24a', x: 6, z: -4, yaw: Math.PI / 2 },
  { kind: 1, x: -22, z: 3.6, yaw: -Math.PI / 2 },
  { kind: 0, color: '#22d3ee', accent: '#39ff88', x: 34, z: 3.8, yaw: Math.PI / 2 },
  { kind: 2, x: 62, z: -3.6, yaw: Math.PI / 2 },
  { kind: 3, x: 92, z: 3.6, yaw: -Math.PI / 2 },
  { kind: 0, color: '#facc15', accent: '#111111', x: 118, z: -4, yaw: Math.PI / 2 },
  { kind: 4, x: 146, z: 3.8, yaw: Math.PI / 2 },
  { kind: 1, x: 172, z: -3.6, yaw: -Math.PI / 2 },
  { kind: 0, color: '#a855f7', accent: '#22d3ee', x: 204, z: 3.8, yaw: Math.PI / 2 },
  { kind: 2, x: 232, z: -3.8, yaw: Math.PI / 2 },
  { kind: 0, color: '#39ff88', accent: '#ff2d55', x: 252, z: 3.6, yaw: -Math.PI / 2 },
  { kind: 3, x: 282, z: -3.6, yaw: Math.PI / 2 },
  { kind: 0, color: '#f97316', accent: '#0f172a', x: 308, z: 3.8, yaw: Math.PI / 2 },
  { kind: 1, x: 340, z: -3.8, yaw: -Math.PI / 2 },
  { kind: 0, color: '#ec4899', accent: '#111111', x: -25, z: -30, yaw: Math.PI },
  { kind: 3, x: 85, z: 34, yaw: 0 },
  { kind: 0, color: '#38bdf8', accent: '#facc15', x: 135, z: -32, yaw: Math.PI },
  { kind: 2, x: 235, z: -30, yaw: Math.PI },
];
const KIND_LEN = [4.4, 4.0, 4.0, 4.6, 4.4];

interface Car { id: number; kind: number; def: CarDef; x: number; z: number; yaw: number; speed: number; len: number; g: THREE.Group | null }
interface Slot { f: Fighter; role: CrewRole; camp: number; hx: number; hz: number; deadT: number; counted: boolean; bonus: number; hunter?: boolean }
interface CampState { aggro: boolean; cleared: boolean; clearT: number; count: number }

/* -------------------------------------------------------------------- views */
function SlotView({ slot, jake }: { slot: Slot; jake: Fighter }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const f = slot.f;
    const near = Math.abs(f.pos.x - jake.pos.x) < 150;
    g.current.visible = near && (f.hp > 0 || slot.deadT < 3.2);
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
  });
  return <group ref={g} visible={false}><Character kind={slot.f.kind} anim={slot.f.ref} label={LABEL[slot.role]} /></group>;
}

function CampView({ def, st }: { def: CampDef; st: CampState }) {
  const ring = useRef<THREE.Mesh>(null!);
  const flag = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    ring.current.visible = !st.cleared;
    flag.current.visible = !st.cleared;
    flag.current.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.15;
    (ring.current.material as THREE.MeshBasicMaterial).opacity = st.aggro ? 0.34 : 0.18 + Math.sin(clock.elapsedTime * 3) * 0.05;
  });
  return (
    <group position={[def.x, 0, def.z]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[7.2, 8.4, 40]} />
        <meshBasicMaterial color="#ff2d55" transparent opacity={0.2} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={flag}>
        <mesh geometry={BOX} material={toon('#27272a')} position={[0, 3, -5]} scale={[0.18, 6, 0.18]} />
        <mesh geometry={BOX} material={glow('#ff2d55')} position={[0.7, 5.3, -5]} scale={[1.4, 0.9, 0.06]} />
      </group>
      {[[-3, -2], [2.5, -4], [-1, 3.6]].map(([x, z], i) => (
        <mesh key={i} geometry={BOX} material={toon(i % 2 ? '#7f1d1d' : '#44403c')} position={[x, 0.45, z]} scale={[0.9, 0.9, 0.9]} />
      ))}
    </group>
  );
}

function CarView({ car }: { car: Car }) {
  const ref = useRef<THREE.Group>(null!);
  useEffect(() => { car.g = ref.current; return () => { car.g = null; }; }, [car]);
  const d = car.def;
  return (
    <group ref={ref} position={[car.x, 0, car.z]} rotation-y={car.yaw}>
      {d.kind === 0 ? <SportsCar color={d.color ?? '#ff2d55'} accent={d.accent ?? '#ffd24a'} /> : <CivCar kind={d.kind - 1} />}
    </group>
  );
}

/* --------------------------------------------------------------------- scene */
export default function FreePlay() {
  const world = useMemo(() => new CombatWorld(), []);
  const { jake, arm, crew, slots, cars, camps } = useMemo(() => {
    const jake = makeFighter({ id: 'jake', label: 'JACK', team: 'heroes', kind: 'jake', isPlayer: true, hp: 120, maxHp: 120, radius: 0.45, damage: 6 });
    jake.pos.set(0, 0, 4); jake.yaw = Math.PI;
    world.add(jake);
    world.rect = { ...AREA };
    const slots: Slot[] = [];
    CAMPS.forEach((c, ci) => {
      let n = 0;
      const zr = Math.abs(c.z) > 20 ? 3.6 : 8;      // alley camps stay inside the 10 m alley
      (Object.keys(c.mix) as CrewRole[]).forEach((role) => {
        for (let i = 0; i < c.mix[role]; i++, n++) {
          const f = makeCrew(`${c.id}-${role}${i}`, role, LABEL[role]);
          const a = (n / 8) * Math.PI * 2 + ci, r = 2.2 + (n % 3) * 1.8;
          const hx = c.x + Math.cos(a) * r, hz = Math.max(c.z - zr, Math.min(c.z + zr, c.z + Math.sin(a) * r * 0.8));
          f.pos.set(hx, 0, hz); f.yaw = Math.random() * 6.28; f.stun = 1e9;
          world.add(f);
          slots.push({ f, role, camp: ci, hx, hz, deadT: 0, counted: false, bonus: 0 });
        }
      });
      // reinforcements that join the camp on later waves (wave 2, 4, 6)
      (['grunt', 'shooter', 'grunt'] as CrewRole[]).forEach((role, bi) => {
        const f = makeCrew(`${c.id}-bonus${bi}`, role, LABEL[role]);
        const a = (bi / 3) * Math.PI * 2 + ci + 0.6, r = 4.2;
        const hx = c.x + Math.cos(a) * r, hz = Math.max(c.z - zr, Math.min(c.z + zr, c.z + Math.sin(a) * r * 0.8));
        f.pos.set(hx, 0, hz); f.hp = 0; f.anim.dead = true; f.stun = 1e9;
        world.add(f);
        slots.push({ f, role, camp: ci, hx, hz, deadT: 99, counted: true, bonus: bi + 1 });
      });
    });
    const cars: Car[] = FLEET.map((d, i) => ({ id: i, kind: d.kind, def: d, x: d.x, z: d.z, yaw: d.yaw, speed: 0, len: KIND_LEN[d.kind], g: null }));
    const camps: CampState[] = CAMPS.map((c) => ({ aggro: false, cleared: false, clearT: 0, count: slots.filter((s) => s.camp === CAMPS.indexOf(c)).length }));
    return { jake, arm: newArsenal(), crew: new Crew(world, jake), slots, cars, camps };
  }, [world]);

  const { camera } = useThree();
  const lock = useMemo(() => new THREE.Vector3(), []);
  const tracers = useRef<Tracer[]>([]);
  const flash = useRef(0);
  const fireQ = useRef(false);
  const hasTarget = useRef(false);
  const cb = useRef(newCombo());
  const aimT = useRef(0);          // >0 shortly after firing: body auto-aims at the nearest enemy (camera stays free, like Level 1)
  const taken = useRef<Record<string, number>>({});
  const drv = useRef<Car | null>(null);
  const hideArms = useRef(false);
  const S = useRef({
    started: false, ended: false, hudT: 0, roll: 0, rollCd: 0, navT: 0, lastMag: 12, kills: 0, wave: 1, waving: false, waitT: 0, best: 0,
    nitro: 0, brake: 0, shake: 0, camYaw: 0, prevHp: 120, crashCd: 0, safeT: 0, heat: 0, quietT: 0, stars: 0, hunterCd: 8,
  });

  const resetCamp = (ci: number) => {
    const st = camps[ci];
    st.aggro = false; st.cleared = false; st.clearT = 0;
    const w = S.current.wave, hpMul = Math.min(3.5, 1 + 0.18 * (w - 1)), dmgMul = Math.min(2.2, 1 + 0.08 * (w - 1));
    for (const sl of slots) {
      if (sl.camp !== ci) continue;
      const f = sl.f, base = CREW[sl.role];
      if (sl.bonus && w < 2 * sl.bonus) {           // reinforcement not unlocked yet
        f.hp = 0; f.anim.dead = true; f.stun = 1e9; sl.deadT = 99; sl.counted = true; continue;
      }
      f.maxHp = Math.round(base.hp * hpMul); f.hp = f.maxHp; f.damage = Math.round(base.damage * dmgMul * 10) / 10;
      f.pos.set(sl.hx, 0, sl.hz); f.vel.set(0, 0, 0); f.yaw = Math.random() * 6.28;
      f.stun = 1e9; f.windup = 0; f.atkCd = 0.8 + Math.random() * 0.6;
      f.anim.dead = false; f.anim.hit = 0; f.anim.windup = 0; f.anim.punch = 0; f.anim.speed = 0;
      sl.deadT = 0; sl.counted = false; sl.hunter = false;
    }
  };
  const wake = (ci: number) => {
    const st = camps[ci];
    if (st.aggro) return;
    st.aggro = true;
    for (const sl of slots) if (sl.camp === ci && sl.f.hp > 0) { sl.f.stun = 0; sl.f.atkCd = 0.5 + Math.random() * 0.8; }
    useGame.getState().toast(`${CAMPS[ci].name} spotted you!`, 'bad'); sfx.warn();
  };

  useEffect(() => {
    nav.range = 70;
    nav.rects = [{ x: (WORLD.minX + WORLD.maxX) / 2, z: 0, w: WORLD.maxX - WORLD.minX, d: 16, color: '#46445c' }];
    for (const q of ROUTES) {                    // side streets + alleys on the minimap
      const za = rowZ(q.row, q.dir), x0 = Math.min(q.sx, q.ax) - 5, x1 = Math.max(q.sx, q.ax) + 5;
      nav.rects.push({ x: q.sx, z: (q.dir * 12 + za) / 2, w: 10, d: Math.abs(za - q.dir * 12) + 5, color: '#46445c' });
      nav.rects.push({ x: (x0 + x1) / 2, z: za, w: x1 - x0, d: 10, color: '#46445c' });
    }
    nav.markers = []; nav.target = null;
    const g0 = useGame.getState();
    S.current.best = loadFreeBest();
    g0.setObjective('Clear every Rugpull camp — then they come back tougher');
    g0.setSurvival({ kills: 0, wave: 1, best: S.current.best, left: 0 });
    g0.setFight({
      hp: jake.hp, maxHp: jake.maxHp, rage: 0, meastLeft: 0, ally: 1, phase: 0, prompt: null,
      stage: 'FREE PLAY', gun: true, ammo: 12, mag: 12, reload: false, foes: [], weapon: 'PISTOL', reserve: -1,
    });
    world.onHit = (e) => {
      if (e.target === jake && !e.blocked) haptic.impact(e.big ? 'heavy' : 'medium');
      const sl = slots.find((s) => s.f === e.target);
      if (sl && e.attacker === jake) wake(sl.camp);
    };
    crew.onFire = () => sfx.shot(true);
    crew.onHitJake = () => haptic.notify('error');
    g0.say([
      { who: 'TEK', text: `${g0.playerName ? g0.playerName + ', ' : ''}the whole city is yours — main street AND the side streets. Take any car, grab weapons, and clear Rugpull's camps, including the ones hiding down the alleys (red rings on the map). Clear them all and the next wave hits harder. It never ends.`, color: '#38bdf8' },
      { who: 'ROBOFAP', text: 'E near a car to drive it. W/S gas + brake, A/D steer, Shift nitro, Space handbrake — and you can shoot from the car. Running over crew hurts them. Weapon crates are on the minimap.', color: '#22d3ee' },
    ], () => { S.current.started = true; });
    return () => {
      engine.stop(); world.onHit = undefined; crew.onFire = undefined; crew.onHitJake = undefined; playerState.locked = false;
      const s = useGame.getState(); s.setPrompt(null); s.setFight({ foes: [], prompt: null, gun: false }); s.setRace({ kmh: 0 }); clearNav();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPunch = () => { fireQ.current = true; };

  const enterCar = (c: Car) => {
    drv.current = c; hideArms.current = true; engine.start();
    jake.invincible = false; S.current.nitro = 0; S.current.brake = 0;
    S.current.camYaw = c.yaw; S.current.prevHp = jake.hp;
    useGame.getState().setPrompt(null); sfx.pickup(); haptic.impact('medium');
  };
  const exitCar = (c: Car) => {
    const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
    const p = { x: c.x + lx * 2.5, z: c.z + lz * 2.5 };
    resolveCircle(p, 0.45);
    playerState.pos.set(p.x, 0, p.z);
    playerState.facing = c.yaw; playerState.yaw = c.yaw + Math.PI; playerState.vy = 0;
    jake.pos.set(p.x, 0, p.z);
    drv.current = null; hideArms.current = false; engine.stop(); c.speed = 0;
    useGame.getState().setRace({ kmh: 0 }); haptic.impact('light');
  };

  /** Arcade driving for the car Jack is in. */
  const drive = (c: Car, dt: number) => {
    const s = S.current, g = useGame.getState();
    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    const m = { x: clamp1(input.joyX + input.keyX), y: clamp1(input.keyY + (input.held.gas ? 1 : 0) - (input.held.rev ? 1 : 0)) };
    if (consume('jump') || consume('dodge')) s.brake = 0.7;
    s.brake = Math.max(0, s.brake - dt);
    const nitro = input.held.sprint && m.y > -0.1;
    const top = nitro ? 44 : 31, acc = nitro ? 26 : 16;
    if (m.y > 0.05) c.speed += (c.speed < top ? acc * m.y : 0) * dt;
    else if (m.y < -0.05) c.speed -= (c.speed > 0.4 ? 32 : 11) * -m.y * dt;
    else c.speed *= Math.exp(-0.45 * dt);
    if (s.brake > 0) c.speed *= Math.exp(-2.4 * dt);
    c.speed = Math.max(-9, Math.min(top + 2, c.speed));
    if (c.speed > top) c.speed -= (c.speed - top) * Math.min(1, 3 * dt);
    const grip = Math.min(1, Math.abs(c.speed) / 6) / (1 + Math.abs(c.speed) * 0.028);
    c.yaw += -m.x * 2.1 * grip * (s.brake > 0 ? 1.5 : 1) * Math.sign(c.speed || 1) * dt;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    c.x += fx * c.speed * dt; c.z += fz * c.speed * dt;

    // world collisions: front and rear contact circles
    const r = 1.0, off = c.len / 2 - 0.9;
    let pushX = 0, pushZ = 0;
    for (const sg of [1, -1]) {
      const p = { x: c.x + fx * off * sg, z: c.z + fz * off * sg };
      const bx = p.x, bz = p.z;
      resolveCircle(p, r);
      pushX += p.x - bx; pushZ += p.z - bz;
    }
    c.x += pushX * 0.6; c.z += pushZ * 0.6;
    // other cars
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), min = 3.3;
      if (d >= min || d < 1e-3) continue;
      const k = (min - d) / d;
      o.x += dx * k * 0.7; o.z += dz * k * 0.7; c.x -= dx * k * 0.3; c.z -= dz * k * 0.3;
      pushX += -dx * k * 0.3; pushZ += -dz * k * 0.3;
      resolveCircle(o, 1.3);
      o.yaw += (Math.sin(c.yaw - o.yaw)) * 0.02 * Math.abs(c.speed);
    }
    c.x = Math.max(AREA.minX, Math.min(AREA.maxX, c.x)); c.z = Math.max(AREA.minZ, Math.min(AREA.maxZ, c.z));
    const hitMag = Math.hypot(pushX, pushZ);
    s.crashCd = Math.max(0, s.crashCd - dt);
    if (hitMag > 0.03) {
      const impact = Math.abs(c.speed);
      c.speed *= 0.45;
      if (impact > 9 && s.crashCd <= 0) { s.crashCd = 0.5; s.shake = Math.min(1, impact / 30); sfx.crash(); haptic.impact('heavy'); jake.hp = Math.max(1, jake.hp - Math.max(0, (impact - 14) * 0.5)); }
      else if (s.crashCd <= 0) { s.crashCd = 0.25; sfx.bump(); }
    }

    // run people over
    if (Math.abs(c.speed) > 6) {
      for (const e of world.enemiesOf(jake)) {
        const dx = e.pos.x - c.x, dz = e.pos.z - c.z;
        const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (Math.abs(along) < c.len / 2 + e.radius && side < 1.1 + e.radius) {
          const dmg = Math.abs(c.speed) * 3.2;
          if (world.damage(e, dmg, { x: c.x, z: c.z }, Math.abs(c.speed) * 0.5, jake)) { c.speed *= 0.93; sfx.punch(); haptic.impact('medium'); }
        }
      }
    }

    // player follows the car; bullets only half-hurt while inside
    playerState.pos.set(c.x, 0, c.z); playerState.facing = c.yaw; playerState.yaw = c.yaw + Math.PI;
    playerState.moving = false; playerState.speed = 0; playerState.vy = 0; playerState.impulse.set(0, 0, 0);
    jake.pos.set(c.x, 0, c.z); jake.yaw = c.yaw;
    if (jake.hp < s.prevHp) jake.hp += (s.prevHp - jake.hp) * 0.6;
    s.prevHp = jake.hp;
    engine.set(Math.abs(c.speed), nitro && c.speed > 20);
    g.setRace({ kmh: Math.round(Math.abs(c.speed) * 3.6) });

    // chase camera
    const trail = Math.min(1, Math.abs(c.speed) / 30);
    s.camYaw = THREE.MathUtils.damp(s.camYaw, c.yaw + (c.speed < -1 ? Math.PI : 0), 4, dt);
    const dist = 8.2 + trail * 2.4;
    const shake = s.shake = Math.max(0, s.shake - dt * 2.5);
    const tx = c.x - Math.sin(s.camYaw) * dist + (Math.random() - 0.5) * shake * 0.6;
    const tz = c.z - Math.cos(s.camYaw) * dist + (Math.random() - 0.5) * shake * 0.6;
    camera.position.lerp(_cam.set(tx, 3.4 + trail * 0.8, tz), 1 - Math.exp(-7 * dt));
    camera.lookAt(c.x + fx * 5, 1.2, c.z + fz * 5);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = 60 + (nitro && c.speed > 25 ? 12 : trail * 6);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.damp(cam.fov, fov, 5, dt); cam.updateProjectionMatrix(); }
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const s = S.current;
    const car = drv.current;

    // sync every car mesh (cheap) and the lock-on target
    for (const c of cars) if (c.g) { c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; }
    {
      let best: Fighter | null = null, bd = 28;
      for (const e of world.enemiesOf(jake)) {
        if (e.stun > 1e8) continue;                      // sleeping camp members don't steal the camera
        const d = Math.hypot(e.pos.x - jake.pos.x, e.pos.z - jake.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      hasTarget.current = !!best && !car;
      if (best) lock.set(best.pos.x, 1, best.pos.z);
    }
    if (g.cutscene || g.dialogue || g.gameOver || s.ended || !s.started) { fireQ.current = false; return; }

    if (car) jake.pos.set(car.x, 0, car.z); else jake.pos.set(playerState.pos.x, 0, playerState.pos.z);
    updateArsenal(arm, dt);

    // ---- enter / exit
    let nearCar: Car | null = null;
    if (!car) {
      let bd = 3.6;
      for (const c of cars) { const d = Math.hypot(c.x - jake.pos.x, c.z - jake.pos.z); if (d < bd) { bd = d; nearCar = c; } }
      const want = nearCar ? 'ENTER CAR' : null;
      if (g.prompt !== want) g.setPrompt(want);
    } else {
      const want = Math.abs(car.speed) < 9 ? 'EXIT CAR' : null;
      if (g.prompt !== want) g.setPrompt(want);
    }
    if (consume('interact')) {
      if (!car && nearCar) enterCar(nearCar);
      else if (car) { if (Math.abs(car.speed) < 9) exitCar(car); else g.toast('Slow down to get out', 'info'); }
    }

    consume('grab'); consume('left'); consume('right');
    if (car) { if (consume('punch')) fireQ.current = true; drive(car, dt); }

    // ---- weapons: swap, crates and shooting all work from inside the car too
    // ---- weapon swap
    if (consume('swap') || consume('special')) {
      if (cycle(arm, 1)) { sfx.swap(); haptic.impact('light'); }
      else g.toast('Find weapon crates around the city!', 'info');
    }
    for (let i = 0; i < WEAPON_ORDER.length; i++) {
      if (!consume(`slot${i + 1}` as PressName)) continue;
      const id = WEAPON_ORDER[i];
      if (select(arm, id)) { sfx.swap(); haptic.impact('light'); }
      else if (!arm.slots[id].has) g.toast(`${WEAPONS[id].name} not found yet — check the crates`, 'info');
    }
    // ---- weapon crates
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
    // ---- shooting
    const want = fireQ.current || input.held.fire;
    aimT.current = want ? 0.7 : Math.max(0, aimT.current - dt);
    fireQ.current = false;
    if (want) {
      const r = fire(arm, world, jake);
      if (r) {
        if (r.dry) sfx.empty();
        else {
          sfx.gun(r.weapon); haptic.impact('light');
          flash.current = 0.06;
          const col = WEAPONS[r.weapon].color;
          for (const ray of r.rays) {
            const t = tracers.current;
            const tr: Tracer = { x1: ray.from.x, z1: ray.from.z, x2: ray.to.x, z2: ray.to.z, life: r.weapon === 'sniper' ? 0.18 : 0.07, max: r.weapon === 'sniper' ? 0.18 : 0.07, color: r.weapon === 'pistol' ? '#fff3a0' : col };
            const slot = t.findIndex((q) => q.life <= 0);
            if (slot >= 0) t[slot] = tr; else if (t.length < 14) t.push(tr); else t[0] = tr;
            for (const h of ray.hits) { const sl = slots.find((q) => q.f === h); if (sl) wake(sl.camp); }
          }
          if (r.weapon === 'shotgun' && !car) { playerState.impulse.x -= Math.sin(r.yaw) * 4; playerState.impulse.z -= Math.cos(r.yaw) * 4; }
        }
      }
    }
    const mag = arm.slots[arm.cur].mag;
    if (arm.reload > 0 && s.lastMag > 0 && mag === 0) sfx.reload();
    s.lastMag = arm.reload > 0 ? 0 : mag;

    if (!car) {
    // ---- dodge roll
    s.rollCd = Math.max(0, s.rollCd - dt);
    if (s.roll > 0) { s.roll -= dt; if (s.roll <= 0) jake.invincible = false; }
    if (consume('dodge') && s.rollCd <= 0) {
      const m = moveVec(), yw = playerState.yaw;
      let dx = -Math.sin(yw) * m.y + Math.cos(yw) * m.x, dz = -Math.cos(yw) * m.y - Math.sin(yw) * m.x;
      if (m.mag < 0.15) { dx = Math.sin(playerState.facing); dz = Math.cos(playerState.facing); }
      const dl = Math.hypot(dx, dz) || 1;
      playerState.impulse.x += (dx / dl) * 22; playerState.impulse.z += (dz / dl) * 22;
      jake.invincible = true; s.roll = ROLL_TIME; s.rollCd = ROLL_CD; haptic.impact('light'); sfx.dodge();
    }
      jake.yaw = playerState.facing;
    }

    // ---- camps: wake on proximity, reset when abandoned, respawn after a clear
    for (let ci = 0; ci < CAMPS.length; ci++) {
      const c = CAMPS[ci], st = camps[ci];
      const d = Math.hypot(jake.pos.x - c.x, jake.pos.z - c.z);
      if (st.cleared) continue;
      if (!st.aggro && d < AGGRO + 7 * s.stars) wake(ci);
      else if (st.aggro && d > CAMP_RESET) resetCamp(ci);
    }

    // ---- simulate
    world.update(dt);
    for (const sl of slots) if (sl.f.hp > 0 && sl.f.stun < 1e8) resolveCircle(sl.f.pos, sl.f.radius);
    crew.update(dt, car ? 0 : playerState.pos.y);
    if (!car) {
      playerState.impulse.x += jake.vel.x; playerState.impulse.z += jake.vel.z;
      playerState.pos.x = Math.max(AREA.minX, Math.min(AREA.maxX, playerState.pos.x));
      playerState.pos.z = Math.max(AREA.minZ, Math.min(AREA.maxZ, playerState.pos.z));
    }
    jake.vel.set(0, 0, 0);

    // ---- kills + camp clears
    for (const sl of slots) {
      if (sl.f.hp > 0) continue;
      sl.deadT += dt;
      if (!sl.counted) {
        sl.counted = true; sl.deadT = 0; s.kills++; if (s.kills > s.best) { s.best = s.kills; saveFreeBest(s.best); }
        const lbl = comboKill(cb.current);
        if (lbl) { g.showBanner(lbl, 1100); haptic.notify('success'); sfx.comboHit(cb.current.n); }
        if (cb.current.n >= 3) jake.hp = Math.min(jake.maxHp, jake.hp + 4);
        s.heat = Math.min(5, s.heat + (sl.hunter ? 0.25 : 0.45)); s.quietT = 0;      // every kill raises the heat
        g.setSurvival({ kills: s.kills, best: s.best, ...comboHud(cb.current) });
        if (!camps[sl.camp].aggro) wake(sl.camp);
      }
    }
    // ---- combo timer + WANTED level
    comboTick(cb.current, dt);
    s.quietT += dt;
    if (s.quietT > 10 && s.heat > 0) s.heat = Math.max(0, s.heat - 0.12 * dt);
    {
      const ns = Math.min(5, Math.ceil(s.heat - 0.001));
      if (ns !== s.stars) {
        if (ns > s.stars) { g.showBanner(`WANTED ${'★'.repeat(ns)}`, 1500); g.toast(ns === 1 ? 'Rugpull noticed you — the crew is on alert' : `Heat ${ns}★ — hunters are coming for you`, 'bad'); sfx.warn(); if (ns >= 3) sfx.drama(); else if (ns >= 2) sfx.boom(); haptic.notify('warning'); }
        else if (ns === 0) g.toast('You lost them. Wanted level cleared.', 'good');
        s.stars = ns; g.setSurvival({ wanted: ns });
      }
      // hunter squads: from 2★ the crew sends reinforcements at you from the street, more of them the hotter it gets
      if (s.stars >= 2) {
        s.hunterCd -= dt;
        const alive = slots.filter((sl) => sl.hunter && sl.f.hp > 0).length;
        if (s.hunterCd <= 0 && alive < s.stars * 2 - 1) {
          s.hunterCd = Math.max(6, 16 - s.stars * 2);
          const pool = slots.filter((sl) => sl.bonus > 0 && sl.f.hp <= 0 && sl.counted && sl.deadT >= 3.2 && !sl.hunter);
          const hpMul = Math.min(3.5, 1 + 0.18 * (s.wave - 1)), dmgMul = Math.min(2.2, 1 + 0.08 * (s.wave - 1));
          for (let k = 0; k < Math.min(pool.length, s.stars - 1); k++) {
            const sl = pool[k], f = sl.f, base = CREW[sl.role], a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 8;
            const p = { x: Math.max(AREA.minX, Math.min(AREA.maxX, jake.pos.x + Math.cos(a) * r)), z: Math.max(AREA.minZ, Math.min(AREA.maxZ, jake.pos.z + Math.sin(a) * r)) };
            resolveCircle(p, f.radius);
            f.maxHp = Math.round(base.hp * hpMul); f.hp = f.maxHp; f.damage = Math.round(base.damage * dmgMul * 10) / 10;
            f.pos.set(p.x, 0, p.z); f.vel.set(0, 0, 0); f.stun = 0; f.windup = 0; f.atkCd = 0.6 + Math.random() * 0.6;
            f.anim.dead = false; f.anim.hit = 0; f.anim.windup = 0; f.anim.punch = 0; f.anim.speed = 0;
            sl.deadT = 0; sl.counted = false; sl.hunter = true;
          }
        }
      } else s.hunterCd = 8;
    }
    for (let ci = 0; ci < CAMPS.length; ci++) {
      const st = camps[ci];
      if (st.cleared) continue;
      if (slots.every((sl) => sl.camp !== ci || sl.f.hp <= 0)) {
        st.cleared = true; st.clearT = 0;
        jake.hp = Math.min(jake.maxHp, jake.hp + 25); s.prevHp = jake.hp;
        if (!camps.every((k) => k.cleared)) { g.showBanner('CAMP CLEARED', 1500); g.toast(`${CAMPS[ci].name} wiped out · +25 HP`, 'good'); sfx.pickup(); haptic.notify('success'); }
      }
    }
    // ---- all camps down = wave cleared; the next wave brings every camp back tougher
    if (!s.waving && camps.every((k) => k.cleared)) {
      s.waving = true; s.waitT = 7;
      jake.hp = Math.min(jake.maxHp, jake.hp + 60); s.prevHp = jake.hp; resupply(arm);
      g.showBanner(`WAVE ${s.wave} CLEARED`, 2400); g.toast('+60 HP · ammo resupplied · they are coming back tougher…', 'good'); sfx.waveStart(); haptic.notify('success');
    }
    if (s.waving) {
      s.waitT -= dt;
      if (s.waitT <= 0) {
        s.waving = false; s.wave++;
        for (let ci = 0; ci < CAMPS.length; ci++) resetCamp(ci);
        g.showBanner(`WAVE ${s.wave}`, 2000); g.toast(`THREAT LEVEL ${s.wave} — crews are tougher and hit harder`, 'bad'); sfx.warn();
        g.setSurvival({ wave: s.wave });
      }
    }

    // ---- gentle regen when nobody is hunting you
    const hunted = camps.some((k) => k.aggro && !k.cleared);
    if (!hunted && jake.hp < jake.maxHp) { jake.hp = Math.min(jake.maxHp, jake.hp + 1.6 * dt); s.prevHp = jake.hp; }

    // ---- minimap + HUD
    s.navT += dt;
    if (s.navT > 0.2) {
      s.navT = 0;
      const mk: { x: number; z: number; color: string; kind: 'poi' | 'enemy' }[] = [];
      for (let ci = 0; ci < CAMPS.length; ci++) if (!camps[ci].cleared) mk.push({ x: CAMPS[ci].x, z: CAMPS[ci].z, color: '#ff2d55', kind: 'poi' });
      for (const sl of slots) if (sl.f.hp > 0 && sl.f.stun < 1e8) mk.push({ x: sl.f.pos.x, z: sl.f.pos.z, color: '#ff2d55', kind: 'enemy' });
      for (const c of CRATES) if ((taken.current[c.id] ?? 0) <= 0) mk.push({ x: c.x, z: c.z, color: WEAPONS[c.w].color, kind: 'poi' });
      for (const c of cars) if (c !== car) mk.push({ x: c.x, z: c.z, color: '#38bdf8', kind: 'poi' });
      nav.markers = mk;
    }
    s.hudT += dt;
    if (s.hudT > 0.1) {
      s.hudT = 0;
      const d = WEAPONS[arm.cur], slot = arm.slots[arm.cur], res = reserveOf(arm);
      const left = slots.filter((sl) => sl.f.hp > 0 && !camps[sl.camp].cleared).length;
      const cl = camps.filter((k) => k.cleared).length;
      g.setSurvival({
        left, cur: WEAPON_ORDER.indexOf(arm.cur), ...comboHud(cb.current),
        arms: WEAPON_ORDER.map((id) => ({
          id, name: WEAPONS[id].name, icon: WEAPONS[id].icon, color: WEAPONS[id].color,
          has: arm.slots[id].has, mag: arm.slots[id].mag, reserve: WEAPONS[id].maxReserve < 0 ? -1 : arm.slots[id].reserve,
        })),
      });
      g.setFight({
        hp: Math.ceil(jake.hp), maxHp: jake.maxHp, stage: car ? 'DRIVING' : 'FREE PLAY', prompt: null,
        gun: true, ammo: slot.mag, mag: d.mag, reload: arm.reload > 0, weapon: d.name, reserve: res === Infinity ? -1 : res,
        foes: [{ id: 'camps', name: s.waving ? `WAVE ${s.wave} CLEARED — NEXT IN ${Math.ceil(s.waitT)}` : `WAVE ${s.wave} · CAMPS ${cl}/${CAMPS.length}`, hp: CAMPS.length - cl, max: CAMPS.length }],
      });
    }

    // ---- death
    if (jake.hp <= 0) {
      s.ended = true; jake.anim.dead = true; jake.anim.speed = 0; haptic.notify('error');
      if (car) { drv.current = null; hideArms.current = false; engine.stop(); }
      setTimeout(() => useGame.getState().setGameOver('REKT'), 900);
    }
  });

  return (
    <>
      <City openAll routes />
      <PlayerLight />
      <FogLayers />
      {cars.map((c) => <CarView key={c.id} car={c} />)}
      {CAMPS.map((c, i) => <CampView key={c.id} def={c} st={camps[i]} />)}
      {CRATES.map((c) => <Crate key={c.id} def={c} taken={taken} />)}
      {slots.map((sl) => <SlotView key={sl.f.id} slot={sl} jake={jake} />)}
      <ArmsFx jake={jake} arm={arm} crew={crew} tracers={tracers} flash={flash} hide={hideArms} />
      <RugStaff openAll />
      <ThirdPersonController
        spawn={[0, 0, 4]} anim={jake.anim} startYaw={0}
        aimAt={() => (hasTarget.current && aimT.current > 0 ? lock : null)}
        driving={() => drv.current !== null}
        canPunch
        onPunch={onPunch}
      />
    </>
  );
}
