'use client';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import ThirdPersonController from '@/components/ThirdPersonController';
import Character from '@/game/characters/Character';
import { Instances, mat4 } from '@/game/world/City';
import { BOX, glow, toon } from '@/game/materials';
import { CombatWorld, makeFighter, type Fighter } from '@/lib/CombatSystem';
import { DuelSystem, DUEL } from '@/lib/DuelSystem';
import { Crew, GUN, makeCrew, newGun, shoot, updateGun } from '@/lib/GunSystem';
import { consume, moveVec } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { PRICE_TARGET } from '@/lib/PriceSystem';
import { rng } from '@/lib/rng';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { clearNav, nav } from '@/lib/nav';
import { rain, sfx, music } from '@/lib/audio';
import { ts } from '@/lib/timeScale';

export const ARENA = 12.5;        // playable radius on the rooftop
const DECK = 15;           // half-size of the visible deck
const ROLL_CD = 0.9, ROLL_TIME = 0.4;
const CRATE = { x: -8.5, z: -1 };   // Tek's pistol cache

/* --------------------------------------------------------------------- views */
function BossView({ f, duel, hide }: { f: Fighter; duel: DuelSystem; hide: MutableRefObject<boolean> }) {
  const g = useRef<THREE.Group>(null!);
  const knife = useRef<THREE.Group>(null!);
  const aura = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    g.current.visible = !hide.current;
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
    if (knife.current) knife.current.visible = duel.phase === 'knife';
    if (aura.current) aura.current.visible = f.invincible && duel.phase !== 'dead';
  });
  return (
    <group ref={g}>
      <Character kind="rugpull" anim={f.ref} label="RUGPULL" />
      <group ref={knife} position={[-0.5, 1.15, 0.55]} visible={false}>
        <mesh geometry={BOX} material={glow('#e2e8f0')} scale={[0.05, 0.08, 0.7]} position={[0, 0, 0.3]} />
        <mesh geometry={BOX} material={toon('#111827')} scale={[0.08, 0.1, 0.18]} />
      </group>
      <mesh ref={aura} position={[0, 1.2, 0]} visible={false}>
        <sphereGeometry args={[1.3, 12, 10]} /><meshBasicMaterial color="#ff2d55" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Aim strip (knife) + chain (grab) visuals, driven straight from the duel state. */
function DuelFx({ duel, jake }: { duel: DuelSystem; jake: Fighter }) {
  const strip = useRef<THREE.Mesh>(null!);
  const chain = useRef<THREE.Mesh>(null!);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const b = duel.boss;
    // knife aim strip
    if (duel.mode === 'telegraph') {
      const dx = duel.aim.x - b.pos.x, dz = duel.aim.z - b.pos.z, len = Math.max(6, Math.hypot(dx, dz) + 2.5);
      strip.current.visible = true;
      tmp.set(b.pos.x + (dx / (Math.hypot(dx, dz) || 1)) * len / 2, 0.06, b.pos.z + (dz / (Math.hypot(dx, dz) || 1)) * len / 2);
      strip.current.position.copy(tmp);
      strip.current.lookAt(b.pos.x + dx * 10, 0.06, b.pos.z + dz * 10);
      strip.current.scale.set(1.6, 0.04, len);
    } else strip.current.visible = false;
    // chain
    if (duel.mode === 'chainWind' || duel.mode === 'grab') {
      const tx = jake.pos.x, tz = jake.pos.z;
      const len = Math.hypot(tx - b.pos.x, tz - b.pos.z);
      chain.current.visible = true;
      chain.current.position.set((b.pos.x + tx) / 2, 1.2, (b.pos.z + tz) / 2);
      chain.current.lookAt(tx, 1.2, tz);
      chain.current.scale.set(duel.mode === 'grab' ? 0.14 : 0.07, duel.mode === 'grab' ? 0.14 : 0.07, len);
    } else chain.current.visible = false;
  });
  return (<>
    <mesh ref={strip} geometry={BOX} visible={false}><meshBasicMaterial color="#ff2d55" transparent opacity={0.45} depthWrite={false} toneMapped={false} /></mesh>
    <mesh ref={chain} geometry={BOX} material={glow('#cbd5e1')} visible={false} />
  </>);
}

/** Rain + lightning. */
export function Storm() {
  const pts = useRef<THREE.Points>(null!);
  const amb = useRef<THREE.AmbientLight>(null!);
  const N = 320;
  const pos = useMemo(() => {
    const r = rng(9), a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { a[i * 3] = (r() - 0.5) * 50; a[i * 3 + 1] = r() * 24; a[i * 3 + 2] = (r() - 0.5) * 50; }
    return a;
  }, []);
  const fl = useRef({ next: 3, t: 0 });
  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05);
    const a = pts.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      let y = a.getY(i) - 30 * dt; if (y < 0) y += 24;
      a.setY(i, y); a.setX(i, a.getX(i) - 4 * dt);
      if (a.getX(i) < -25) a.setX(i, 25);
    }
    a.needsUpdate = true;
    const f = fl.current; f.next -= dt;
    if (f.next <= 0) { f.t = 0.14; f.next = 3.5 + Math.random() * 6; setTimeout(() => sfx.thunder(), 250 + Math.random() * 900); }
    f.t = Math.max(0, f.t - dt);
    amb.current.intensity = 0.45 + (f.t > 0 ? 3.2 * (Math.sin(f.t * 60) > -0.2 ? 1 : 0.3) : 0);
  });
  return (<>
    <ambientLight ref={amb} color="#9db4ff" intensity={0.45} />
    <points ref={pts} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial color="#a8c8ff" size={0.14} transparent opacity={0.55} depthWrite={false} />
    </points>
  </>);
}

function Fireworks({ on }: { on: MutableRefObject<boolean> }) {
  const pts = useRef<THREE.Points>(null!);
  const B = 8, P = 36, N = B * P;
  const data = useMemo(() => ({
    pos: new Float32Array(N * 3).fill(-999), col: new Float32Array(N * 3),
    vel: new Float32Array(N * 3), t0: new Float32Array(B).fill(-99), org: new Float32Array(B * 3),
  }), []);
  const st = useRef({ t: 0, next: 0, i: 0 });
  const cols = useMemo(() => ['#ff4fd8', '#39ff88', '#22d3ee', '#ffd24a', '#ff2d55'].map((c) => new THREE.Color(c)), []);
  useFrame((_, dt) => {
    const s = st.current; s.t += Math.min(dt, 0.05);
    if (on.current && s.t >= s.next) {
      s.next = s.t + 0.28 + Math.random() * 0.3; sfx.firework();
      const b = s.i++ % B, c = cols[Math.floor(Math.random() * cols.length)];
      data.t0[b] = s.t;
      data.org[b * 3] = (Math.random() - 0.5) * 70; data.org[b * 3 + 1] = 26 + Math.random() * 22; data.org[b * 3 + 2] = -45 - Math.random() * 35;
      for (let k = 0; k < P; k++) {
        const i = b * P + k, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 7 + Math.random() * 6;
        data.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; data.vel[i * 3 + 1] = Math.cos(ph) * sp; data.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        data.col[i * 3] = c.r; data.col[i * 3 + 1] = c.g; data.col[i * 3 + 2] = c.b;
      }
    }
    for (let b = 0; b < B; b++) {
      const age = s.t - data.t0[b];
      for (let k = 0; k < P; k++) {
        const i = b * P + k;
        if (age < 0 || age > 2.2) { data.pos[i * 3 + 1] = -999; continue; }
        data.pos[i * 3] = data.org[b * 3] + data.vel[i * 3] * age;
        data.pos[i * 3 + 1] = data.org[b * 3 + 1] + data.vel[i * 3 + 1] * age - 3.2 * age * age;
        data.pos[i * 3 + 2] = data.org[b * 3 + 2] + data.vel[i * 3 + 2] * age;
      }
    }
    const g = pts.current.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  });
  return (
    <points ref={pts} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={1.1} transparent depthWrite={false} toneMapped={false} />
    </points>
  );
}

/** Rooftop deck, railing, skyline ring. */
export function Rooftop() {
  const { blds, cols } = useMemo(() => {
    const r = rng(55), blds: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
    const pal = ['#241b3d', '#2d2250', '#1b2547', '#33203d'];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + r() * 0.1, d = 38 + r() * 55, h = 12 + r() * 70, w = 7 + r() * 9;
      blds.push(mat4(Math.cos(a) * d, h / 2 - 25, Math.sin(a) * d, w, h, w));
      cols.push(new THREE.Color(pal[Math.floor(r() * pal.length)]));
    }
    return { blds, cols };
  }, []);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff' }), []);
  return (
    <group>
      <mesh geometry={BOX} material={toon('#2a2740')} position={[0, -0.5, 0]} scale={[DECK * 2, 1, DECK * 2]} />
      <mesh geometry={BOX} material={toon('#1a1730')} position={[0, -30, 0]} scale={[DECK * 1.7, 58, DECK * 1.7]} />
      {/* neon trim + railing */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={BOX} material={glow('#ff4fd8')} position={[s * DECK, 0.12, 0]} scale={[0.15, 0.2, DECK * 2]} />
          <mesh geometry={BOX} material={glow('#22d3ee')} position={[0, 0.12, s * DECK]} scale={[DECK * 2, 0.2, 0.15]} />
          <mesh geometry={BOX} material={toon('#14122a')} position={[s * DECK, 0.55, 0]} scale={[0.12, 1.1, DECK * 2]} />
          <mesh geometry={BOX} material={toon('#14122a')} position={[0, 0.55, s * DECK]} scale={[DECK * 2, 1.1, 0.12]} />
        </group>
      ))}
      {/* ring of centre markings */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}><ringGeometry args={[ARENA - 0.25, ARENA, 40]} /><meshBasicMaterial color="#ff2d55" toneMapped={false} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}><ringGeometry args={[3.2, 3.4, 32]} /><meshBasicMaterial color="#39ff88" toneMapped={false} /></mesh>
      <Instances geometry={BOX} material={white} matrices={blds} colors={cols} />
      <pointLight position={[0, 9, 0]} color="#ff4fd8" intensity={55} distance={34} />
      <pointLight position={[-9, 5, -9]} color="#22d3ee" intensity={26} distance={26} />
    </group>
  );
}

/** Ending props: Rugpull's chain (burns), Tek's airdrop crates, Robofap's supply furnace, the grave. */
function EndingProps({ S }: { S: MutableRefObject<{ et: number; grave: boolean }> }) {
  const fire = useRef<THREE.Mesh>(null!);
  const chain = useRef<THREE.Group>(null!);
  const crates = useRef<(THREE.Group | null)[]>([]);
  const furnace = useRef<THREE.Group>(null!);
  const flame = useRef<THREE.Mesh>(null!);
  const grave = useRef<THREE.Group>(null!);
  const crateSpots = useMemo<[number, number][]>(() => [[-5, 3], [5, 4], [-2, 8], [3, -1], [-8, -2], [8, -4]], []);
  useFrame(() => {
    const { et, grave: gv } = S.current;
    const burning = et > 0.2 && et < 4.8;
    chain.current.visible = et > 0 && et < 5.5;
    fire.current.visible = burning;
    if (burning) { const k = Math.min(1, et / 3); fire.current.scale.set(0.5 + k, 0.5 + k * 2.4 + Math.sin(et * 30) * 0.15, 0.5 + k); }
    for (let i = 0; i < crates.current.length; i++) {
      const g = crates.current[i]; if (!g) continue;
      const t = et - 4 - i * 0.18;
      g.visible = t > 0 && et < 22;
      g.position.y = Math.max(0, 38 - t * 9);
      g.rotation.y = i + t * 0.6;
      (g.children[1] as THREE.Object3D).visible = g.position.y > 0.1; // chute disappears on landing
    }
    const fOn = et > 9;
    furnace.current.visible = fOn;
    if (fOn) { flame.current.scale.set(1, 1 + Math.min(1, (et - 9) / 3) * 9 + Math.sin(et * 25) * 0.4, 1); flame.current.position.y = 1.4 + flame.current.scale.y * 0.9; }
    grave.current.visible = gv;
  });
  return (<>
    <group ref={chain} visible={false}>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={toon('#94a3b8')} position={[Math.cos(i * 0.7) * 1.1, 0.12, Math.sin(i * 0.7) * 1.1]} rotation-y={i * 0.7} scale={[0.5, 0.18, 0.18]} />
      ))}
      <mesh ref={fire} visible={false} position={[0, 0.9, 0]}><coneGeometry args={[0.9, 2, 7]} /><meshBasicMaterial color="#ff7a18" transparent opacity={0.85} toneMapped={false} /></mesh>
    </group>
    {crateSpots.map(([x, z], i) => (
      <group key={i} ref={(g) => { crates.current[i] = g; }} position={[x, 38, z]} visible={false}>
        <mesh geometry={BOX} material={toon('#a16207')} position={[0, 0.5, 0]} scale={[1, 1, 1]} />
        <mesh position={[0, 3.2, 0]}><sphereGeometry args={[2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={i % 2 ? '#39ff88' : '#ff4fd8'} side={THREE.DoubleSide} /></mesh>
        <mesh geometry={BOX} material={glow('#39ff88')} position={[0, 1.02, 0]} scale={[0.5, 0.04, 0.5]} />
      </group>
    ))}
    <group ref={furnace} position={[-7, 0, -5]} visible={false}>
      <mesh geometry={BOX} material={toon('#3f3f46')} position={[0, 0.7, 0]} scale={[2.4, 1.4, 2.4]} />
      <mesh ref={flame} position={[0, 2, 0]}><coneGeometry args={[0.9, 1.8, 8]} /><meshBasicMaterial color="#ff5a1f" transparent opacity={0.85} toneMapped={false} /></mesh>
    </group>
    <group ref={grave} position={[0, 0, -5]} visible={false}>
      <mesh geometry={BOX} material={toon('#78716c')} position={[0, 0.12, 0]} scale={[1.8, 0.24, 3]} />
      <mesh geometry={BOX} material={toon('#a16207')} position={[0, 1.0, -0.8]} scale={[0.14, 1.7, 0.14]} />
      <mesh geometry={BOX} material={toon('#a16207')} position={[0, 1.4, -0.8]} scale={[0.9, 0.14, 0.14]} />
      <mesh geometry={BOX} material={glow('#39ff88')} position={[0.9, 0.5, 0.4]} scale={[0.12, 0.8, 0.12]} />
      <mesh geometry={BOX} material={glow('#39ff88')} position={[0.9, 0.5, 0.4]} scale={[0.03, 1.1, 0.03]} />
    </group>
  </>);
}

/** Subordinate view: appears when spawned, lies where it fell, then vanishes after a few seconds. */
function CrewView({ f, spawned }: { f: Fighter; spawned: MutableRefObject<Set<string>> }) {
  const g = useRef<THREE.Group>(null!);
  const dead = useRef(0);
  useFrame((_, dt) => {
    const on = spawned.current.has(f.id);
    if (f.hp <= 0) dead.current += dt;
    g.current.visible = on && dead.current < 3.2;
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
  });
  return <group ref={g} visible={false}><Character kind={f.kind} anim={f.ref} label={f.label} scale={f.role === 'brute' ? 1 : 1} /></group>;
}

/** The pistol cache: glowing crate + beacon, gone once taken. */
function GunCrate({ taken }: { taken: MutableRefObject<boolean> }) {
  const g = useRef<THREE.Group>(null!);
  const beam = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    g.current.visible = !taken.current;
    g.current.rotation.y = clock.elapsedTime * 0.8;
    beam.current.scale.y = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  return (
    <group ref={g} position={[CRATE.x, 0, CRATE.z]}>
      <mesh geometry={BOX} material={toon('#3f6212')} position={[0, 0.5, 0]} scale={[1.3, 1, 0.9]} />
      <mesh geometry={BOX} material={glow('#39ff88')} position={[0, 1.02, 0]} scale={[1.0, 0.06, 0.6]} />
      <mesh geometry={BOX} material={toon('#111')} position={[0, 1.15, 0]} scale={[0.5, 0.14, 0.12]} />
      <mesh ref={beam} position={[0, 5, 0]}><cylinderGeometry args={[0.5, 0.5, 10, 10, 1, true]} /><meshBasicMaterial color="#39ff88" transparent opacity={0.22} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

export interface Tracer { x1: number; z1: number; x2: number; z2: number; life: number }
/** Jack's pistol, muzzle flash, tracers; enemy bullets. */
export function GunFx({ jake, gun, crew, tracers, flash }: {
  jake: Fighter; gun: ReturnType<typeof newGun>; crew: Crew; tracers: MutableRefObject<Tracer[]>; flash: MutableRefObject<number>;
}) {
  const hold = useRef<THREE.Group>(null!);
  const muzzle = useRef<THREE.Mesh>(null!);
  const tr = useRef<(THREE.Mesh | null)[]>([]);
  const bl = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    hold.current.visible = gun.has && jake.hp > 0;
    hold.current.position.set(
      playerState.pos.x + Math.cos(jake.yaw) * 0.38 + Math.sin(jake.yaw) * 0.35, 1.12, playerState.pos.z - Math.sin(jake.yaw) * 0.38 + Math.cos(jake.yaw) * 0.35);
    hold.current.rotation.y = jake.yaw;
    flash.current = Math.max(0, flash.current - dt);
    muzzle.current.visible = flash.current > 0;
    for (let i = 0; i < 6; i++) {
      const m = tr.current[i]; if (!m) continue;
      const t = tracers.current[i];
      if (t && t.life > 0) {
        t.life -= dt;
        const dx = t.x2 - t.x1, dz = t.z2 - t.z1, len = Math.hypot(dx, dz) || 0.01;
        m.visible = true; m.position.set((t.x1 + t.x2) / 2, 1.15, (t.z1 + t.z2) / 2);
        m.lookAt(t.x2, 1.15, t.z2); m.scale.set(0.05, 0.05, len);
      } else m.visible = false;
    }
    for (let i = 0; i < 16; i++) {
      const m = bl.current[i]; if (!m) continue;
      const b = crew.bullets[i];
      if (b) { m.visible = true; m.position.set(b.x, 1.1, b.z); } else m.visible = false;
    }
  });
  return (<>
    <group ref={hold} visible={false}>
      <mesh geometry={BOX} material={toon('#111827')} position={[0, 0, 0.18]} scale={[0.08, 0.1, 0.42]} />
      <mesh geometry={BOX} material={toon('#111827')} position={[0, -0.1, 0.05]} scale={[0.08, 0.16, 0.1]} />
      <mesh ref={muzzle} position={[0, 0, 0.55]} visible={false}><octahedronGeometry args={[0.2, 0]} /><meshBasicMaterial color="#ffe08a" toneMapped={false} /></mesh>
    </group>
    {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={'t' + i} ref={(m) => { tr.current[i] = m; }} geometry={BOX} material={glow('#fff3a0')} visible={false} />)}
    {Array.from({ length: 16 }).map((_, i) => (
      <mesh key={'b' + i} ref={(m) => { bl.current[i] = m; }} visible={false}>
        <sphereGeometry args={[0.22, 8, 6]} /><meshBasicMaterial color="#ff2d55" toneMapped={false} />
      </mesh>
    ))}
  </>);
}

/* --------------------------------------------------------------------- scene */
type Stage = 'arm' | 'wave1' | 'wave2' | 'boss';
const WAVES: Record<'wave1' | 'wave2', { id: string; role: 'grunt' | 'shooter' | 'brute'; label: string; at: [number, number] }[]> = {
  wave1: [
    { id: 'g1', role: 'grunt', label: 'GOON', at: [-10, -7] }, { id: 'g2', role: 'grunt', label: 'GOON', at: [10, -7] },
    { id: 'g3', role: 'grunt', label: 'GOON', at: [-11.5, 3] }, { id: 'g4', role: 'grunt', label: 'GOON', at: [11.5, 3] },
    { id: 'g5', role: 'grunt', label: 'GOON', at: [0, -11.5] },
  ],
  wave2: [
    { id: 's1', role: 'shooter', label: 'GUNMAN', at: [-9, -9] }, { id: 's2', role: 'shooter', label: 'GUNMAN', at: [9, -9] },
    { id: 's3', role: 'shooter', label: 'GUNMAN', at: [0, -12] },
    { id: 'g6', role: 'grunt', label: 'GOON', at: [-12, 1] }, { id: 'g7', role: 'grunt', label: 'GOON', at: [12, 1] },
    { id: 'b1', role: 'brute', label: 'ENFORCER', at: [0, 11] },
  ],
};
const TOTAL_CREW = WAVES.wave1.length + WAVES.wave2.length;

export default function Level5() {
  const { camera } = useThree();
  const world = useMemo(() => new CombatWorld(), []);
  const { jake, boss, duel, gun, crew, crewList } = useMemo(() => {
    const jake = makeFighter({ id: 'jake', label: 'JACK', team: 'heroes', kind: 'jake', isPlayer: true, hp: 120, maxHp: 120, radius: 0.45, damage: 6 });
    const boss = makeFighter({
      id: 'rug', label: 'RUGPULL', team: 'bears', kind: 'rugpull', hp: DUEL.bossHp, maxHp: DUEL.bossHp, radius: 0.7, reach: 2.2,
      speed: 3.2, damage: 12, windupTime: 0.55, cooldown: 1.2, armor: true, kbResist: 0.6,
    });
    jake.pos.set(0, 0, 8); jake.yaw = Math.PI; boss.pos.set(0, 0, -11);
    boss.invincible = true; boss.manual = true;          // Rugpull watches from the back until his crew is dead
    world.add(jake); world.add(boss);
    world.bounds = { x: 0, z: 0, r: ARENA };
    const crewList = [...WAVES.wave1, ...WAVES.wave2].map((c) => ({ c, f: makeCrew(c.id, c.role, c.label) }));
    return { jake, boss, duel: new DuelSystem(world, jake, boss), gun: newGun(), crew: new Crew(world, jake), crewList };
  }, [world]);

  const lock = useMemo(() => new THREE.Vector3(), []);
  const hideBoss = useRef(false);
  const fw = useRef(false);
  const spawned = useRef(new Set<string>());
  const taken = useRef(false);
  const tracers = useRef<Tracer[]>([]);
  const flash = useRef(0);
  const S = useRef({
    started: false, ended: false, hudT: 0, roll: 0, rollCd: 0, prompt: null as string | null, promptT: 0, stage: 'arm' as Stage, busy: false, pickPrompt: false,
    et: 0, grave: false, pumped: false, banner: false, burned: false, dropped: false, furn: false, ending: false,
  });
  const endProps = useRef<{ et: number; grave: boolean }>({ et: 0, grave: false });

  const spawnWave = (w: 'wave1' | 'wave2') => {
    for (const { c, f } of crewList) {
      if (!WAVES[w].some((x) => x.id === c.id)) continue;
      f.pos.set(c.at[0], 0, c.at[1]); f.yaw = Math.atan2(-c.at[0], -c.at[1]);
      world.add(f); spawned.current.add(c.id);
    }
    sfx.warn();
  };
  const crewLeft = () => crewList.filter(({ f }) => spawned.current.has(f.id) && f.hp > 0).length;
  const crewKilled = () => crewList.filter(({ f }) => spawned.current.has(f.id) && f.hp <= 0).length;

  useEffect(() => {
    nav.range = 1; nav.rects = []; nav.markers = []; nav.target = null;
    rain.start();
    const g0 = useGame.getState();
    g0.setObjective('Get a gun first — grab the pistol crate (green beam)');
    g0.setFight({
      hp: jake.hp, maxHp: jake.maxHp, rage: 0, meastLeft: 0, ally: 1, phase: 0, prompt: null,
      stage: 'GET THE PISTOL', gun: false, ammo: GUN.magSize, mag: GUN.magSize, reload: false, foes: [],
    });
    world.onHit = (e) => {
      if (e.target === jake && !e.blocked) haptic.impact(e.big ? 'heavy' : 'medium');
    };
    crew.onFire = () => sfx.shot(true);
    crew.onHitJake = () => haptic.notify('error');
    const flashPrompt = (t: string, sec = 1.1) => { S.current.prompt = t; S.current.promptT = sec; };
    duel.ev = {
      onPhase: (p) => {
        const s = useGame.getState();
        if (p === 'knife') {
          s.showBanner('PHASE 2 — THE KNIFE', 2200); s.setObjective('Dodge the lunges (Space / DODGE), shoot when he whiffs');
          s.setFight({ phase: 2 }); s.toast('+30 HP', 'good'); sfx.battleCry(); sfx.drama();
          s.say([{ who: 'RUGPULL', text: "Bullets? Cute. I pulled the liquidity... and I pulled THIS.", color: '#ff2d55' }]);
        } else if (p === 'chain') {
          s.showBanner('PHASE 3 — THE CHAIN', 2200); s.setObjective('Roll the chain throw, or MASH GRAB (F / G) to break free');
          s.setFight({ phase: 3 }); s.toast('+30 HP', 'good'); sfx.battleCry(); sfx.drama();
          s.say([{ who: 'RUGPULL', text: "The 30% tax chain. Every holder I ever bound. Come here, Jack.", color: '#ff2d55' }]);
        }
        haptic.notify('warning');
      },
      onTelegraph: (k) => { if (k === 'knife') sfx.warn(); else sfx.chain(); flashPrompt(k === 'knife' ? 'DODGE!' : 'CHAIN! ROLL / JUMP!', k === 'knife' ? 0.85 : 1.0); },
      onDodged: () => { useGame.getState().toast('DODGED — shoot him now!', 'good'); haptic.notify('success'); sfx.dodge(); },
      onJakeHit: () => haptic.notify('error'),
      onGrabbed: () => { playerState.locked = true; haptic.impact('heavy'); sfx.grab(); },
      onBroken: () => {
        playerState.locked = false; useGame.getState().setQte(null);
        useGame.getState().toast('CHAIN BROKEN!', 'good'); haptic.notify('success'); sfx.crash();
      },
    };
    g0.say([
      { who: 'RUGPULL', text: "You took my 200 OGs. You dumped my bag on LIVESTREAM. You rugged the rugger.", color: '#ff2d55' },
      { who: 'JACK', text: "You put a 30% tax on every holder who ever believed in this coin. End of the line, Rugpull.", color: '#a78bfa' },
      { who: 'RUGPULL', text: "With what? Your bare hands? I have a crew on every stairwell. Come and get me, if you can.", color: '#ff2d55' },
      { who: 'TEK', text: "Jack, I dropped a pistol cache on the roof — the crate with the green beam, left of you. Get it FIRST. Press E / tap the prompt to pick it up.", color: '#38bdf8' },
      { who: 'ROBOFAP', text: "Pistol: 12 rounds, auto-reload, auto-aim. Hit FIRE, move, and roll (Space / DODGE) through bullets. Kill his whole crew, then Rugpull himself.", color: '#22d3ee' },
    ], () => { S.current.started = true; });
    return () => {
      ts.scale = 1; music.tempo(1); (camera as THREE.PerspectiveCamera).fov = 60; (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      rain.stop(); playerState.locked = false; world.onHit = undefined; duel.ev = {}; crew.onFire = undefined; crew.onHitJake = undefined;
      const s = useGame.getState(); s.setQte(null); s.setPrompt(null); s.setFight({ foes: [], prompt: null, gun: false }); clearNav();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fire = () => {
    const st = S.current;
    if (!st.started || st.ended || duel.grabbed || st.busy) return;
    if (!gun.has) { jake.yaw = playerState.facing; world.punch(jake, 1, true); return; }   // unarmed: weak punch
    jake.yaw = playerState.facing;
    const r = shoot(gun, world, jake);
    if (!r) { if (gun.reload > 0) useGame.getState().toast('Reloading…', 'info'); return; }
    sfx.shot(false); flash.current = 0.06;
    const t = tracers.current; const slot = t.findIndex((q) => q.life <= 0);
    const tr = { x1: r.from.x, z1: r.from.z, x2: r.to.x, z2: r.to.z, life: 0.07 };
    if (slot >= 0) t[slot] = tr; else if (t.length < 6) t.push(tr); else t[0] = tr;
    if (gun.mag <= 0) sfx.reload();
  };

  const slow = useRef(0);          // seconds of slow-motion left (Rugpull's death)
  useFrame((_, dtRaw) => {
    // ---- slow-motion death: world crawls, music drags, camera pushes in, then everything eases back to normal
    if (slow.current > 0) {
      slow.current -= Math.min(dtRaw, 0.05);
      const k = slow.current > 1 ? 0 : 1 - Math.max(0, slow.current) / 1;     // ramps 0 -> 1 over the last second
      ts.scale = 0.12 + (1 - 0.12) * k * k;
      music.tempo(0.3 + 0.7 * k);
      const cam = camera as THREE.PerspectiveCamera;
      const fov = 38 + 22 * k * k;
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.damp(cam.fov, fov, 6, Math.min(dtRaw, 0.05)); cam.updateProjectionMatrix(); }
      if (slow.current <= 0) { ts.scale = 1; music.tempo(1); cam.fov = 60; cam.updateProjectionMatrix(); playerState.locked = false; }
    }
    const dt = Math.min(dtRaw, 0.05) * ts.scale;
    const g = useGame.getState();
    const s = S.current;

    // ---- camera lock: nearest live, vulnerable enemy (else Rugpull)
    {
      let best: Fighter | null = null, bd = Infinity;
      for (const e of world.enemiesOf(jake)) {
        if (e.invincible && e !== boss) continue;
        const d = Math.hypot(e.pos.x - jake.pos.x, e.pos.z - jake.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      const t = best ?? boss; lock.set(t.pos.x, 1, t.pos.z);
    }

    // ---- ending cutscene effect timeline
    if (g.cutscene?.id === 'ending') {
      s.et += dt; endProps.current.et = s.et;
      if (s.et > 0.1 && !s.burned) { s.burned = true; sfx.burn(); }
      if (s.et >= 4 && !s.dropped) { s.dropped = true; sfx.airdrop(); }
      if (s.et >= 9 && !s.furn) { s.furn = true; sfx.burn(); sfx.slam(); }
      if (s.et >= 13.5 && !s.pumped) { s.pumped = true; fw.current = true; g.pump(PRICE_TARGET.l5, 10000); haptic.notify('success'); }
      if (s.et >= 23 && !s.banner) { s.banner = true; g.showBanner('$1,000,000,000 MARKET CAP', 4200); haptic.notify('success'); }
    } else if (g.cutscene?.id === 'grave') { endProps.current.grave = true; hideBoss.current = true; }
    if (g.cutscene || g.dialogue || g.minigame || g.gameOver || s.ended) return;
    if (!s.started) return;

    // ---- sync Jack -> fighter
    jake.pos.set(playerState.pos.x, 0, playerState.pos.z);
    jake.yaw = playerState.facing;
    const jy = playerState.pos.y;
    updateGun(gun, dt);

    // ---- pickup the pistol
    if (s.stage === 'arm') {
      const near = Math.hypot(jake.pos.x - CRATE.x, jake.pos.z - CRATE.z) < 2.6;
      if (near && !s.pickPrompt) { s.pickPrompt = true; g.setPrompt('Pick up the pistol'); }
      else if (!near && s.pickPrompt) { s.pickPrompt = false; g.setPrompt(null); }
      if (near && consume('interact')) {
        s.pickPrompt = false; g.setPrompt(null);
        gun.has = true; gun.mag = GUN.magSize; taken.current = true; sfx.pickup(); haptic.notify('success');
        g.toast('PISTOL ACQUIRED — 12 rounds', 'good');
        g.setObjective('Kill Rugpull’s crew — wave 1');
        s.busy = true;
        g.say([
          { who: 'JACK', text: 'Locked and loaded.', color: '#a78bfa' },
          { who: 'RUGPULL', text: "He found a toy. BOYS — kill him!", color: '#ff2d55' },
        ], () => { s.busy = false; s.stage = 'wave1'; spawnWave('wave1'); useGame.getState().showBanner('WAVE 1 — KILL THE CREW', 1800); });
        return;
      }
    }

    // ---- dodge roll (i-frames + burst)
    s.rollCd = Math.max(0, s.rollCd - dt);
    if (s.roll > 0) { s.roll -= dt; if (s.roll <= 0) jake.invincible = false; }
    if (consume('dodge') && !duel.grabbed && s.rollCd <= 0) {
      const m = moveVec(), yw = playerState.yaw;
      let dx = -Math.sin(yw) * m.y + Math.cos(yw) * m.x, dz = -Math.cos(yw) * m.y - Math.sin(yw) * m.x;
      if (m.mag < 0.15) { // no input: sidestep perpendicular to the target
        const bx = lock.x - jake.pos.x, bz = lock.z - jake.pos.z, bd = Math.hypot(bx, bz) || 1;
        dx = bz / bd; dz = -bx / bd;
      }
      const dl = Math.hypot(dx, dz) || 1;
      playerState.impulse.x += (dx / dl) * 22; playerState.impulse.z += (dz / dl) * 22;
      jake.invincible = true; s.roll = ROLL_TIME; s.rollCd = ROLL_CD; haptic.impact('light'); sfx.dodge();
    }
    // desktop melee (Q) when armed
    if (consume('special') && gun.has && !duel.grabbed) { jake.yaw = playerState.facing; if (world.punch(jake, 1.6, true)) sfx.hit(false); }

    // ---- chain mash
    if (duel.grabbed) {
      jake.pos.x = THREE.MathUtils.lerp(jake.pos.x, boss.pos.x + Math.sin(boss.yaw) * 1.7, 0.2);
      jake.pos.z = THREE.MathUtils.lerp(jake.pos.z, boss.pos.z + Math.cos(boss.yaw) * 1.7, 0.2);
      playerState.pos.x = jake.pos.x; playerState.pos.z = jake.pos.z;
      for (const n of ['grab', 'interact', 'punch', 'jump'] as const) if (consume(n)) { duel.mash(); haptic.impact('light'); }
      g.setQte({ label: `BREAK THE CHAIN — MASH GRAB (F / G)! ${Math.ceil(Math.max(0, duel.grabT))}s`, progress: duel.grabProgress });
    } else { consume('grab'); if (playerState.locked) { playerState.locked = false; g.setQte(null); } }

    // ---- simulate
    world.update(dt);
    crew.update(dt, jy);
    if (s.stage === 'boss') duel.update(dt, jy);
    playerState.impulse.x += jake.vel.x; playerState.impulse.z += jake.vel.z; jake.vel.set(0, 0, 0);
    const d = Math.hypot(playerState.pos.x, playerState.pos.z);
    if (d > ARENA) { playerState.pos.x *= ARENA / d; playerState.pos.z *= ARENA / d; }

    // ---- stage flow
    if ((s.stage === 'wave1' || s.stage === 'wave2') && crewLeft() === 0) {
      const w = s.stage;
      jake.hp = Math.min(jake.maxHp, jake.hp + (w === 'wave1' ? 25 : 35)); gun.mag = GUN.magSize; gun.reload = 0;
      g.toast(w === 'wave1' ? '+25 HP · ammo refilled' : '+35 HP · ammo refilled', 'good');
      s.busy = true;
      if (w === 'wave1') {
        s.stage = 'wave2';
        g.setObjective('Kill Rugpull’s crew — wave 2 (gunmen: dodge their bullets!)');
        g.say([
          { who: 'RUGPULL', text: "Useless. Send the gunmen. And the Enforcer.", color: '#ff2d55' },
          { who: 'ROBOFAP', text: 'Gunmen telegraph before they fire — their bullets are slow. Roll through them.', color: '#22d3ee' },
        ], () => { s.busy = false; spawnWave('wave2'); useGame.getState().showBanner('WAVE 2 — GUNMEN INCOMING', 1800); });
      } else {
        s.stage = 'boss';
        g.setObjective('Rugpull is next. Shoot him — and dodge the knife and the chain.');
        g.setFight({ phase: 1 }); sfx.battleCry(); sfx.boom();
        g.say([
          { who: 'RUGPULL', text: "Every last one of them. FINE. I'll do it myself.", color: '#ff2d55' },
          { who: 'JACK', text: 'You and me. The way it should have been.', color: '#a78bfa' },
        ], () => {
          s.busy = false; boss.manual = false; boss.invincible = false; boss.hp = boss.maxHp;
          useGame.getState().showBanner('RUGPULL — FINAL FIGHT', 2200);
        });
      }
    }

    // ---- prompt text
    if (s.promptT > 0) { s.promptT -= dt; if (s.promptT <= 0) s.prompt = null; }

    // ---- HUD 10 Hz
    s.hudT += dt;
    if (s.hudT > 0.1) {
      s.hudT = 0;
      const stageText = s.stage === 'arm' ? 'GET THE PISTOL' : s.stage === 'wave1' ? 'WAVE 1 / 2' : s.stage === 'wave2' ? 'WAVE 2 / 2' : 'RUGPULL';
      const foes = s.stage === 'boss'
        ? [{ id: 'rug', name: 'RUGPULL', hp: Math.ceil(boss.hp), max: boss.maxHp }]
        : s.stage === 'arm' ? [] : [{ id: 'crew', name: `RUGPULL'S CREW — ${crewKilled()}/${TOTAL_CREW} DOWN`, hp: TOTAL_CREW - crewKilled(), max: TOTAL_CREW }];
      g.setFight({
        hp: Math.ceil(jake.hp), maxHp: jake.maxHp, prompt: s.prompt, stage: stageText, foes,
        gun: gun.has, ammo: gun.mag, mag: GUN.magSize, reload: gun.reload > 0,
      });
    }

    // ---- outcomes
    if (jake.hp <= 0) {
      s.ended = true; jake.anim.dead = true; jake.anim.speed = 0; playerState.locked = false; haptic.notify('error');
      g.setQte(null); g.setPrompt(null);
      setTimeout(() => useGame.getState().setGameOver('REKT'), 900);
    } else if (duel.phase === 'dead' && !s.ending) {
      s.ended = true; s.ending = true; playerState.locked = true; g.setQte(null);
      slow.current = 3.6; ts.scale = 0.12; music.tempo(0.3); sfx.boom(); sfx.slowDeath(); haptic.impact('heavy');
      g.setFight({ prompt: null, foes: [{ id: 'rug', name: 'RUGPULL', hp: 0, max: boss.maxHp }] });
      g.showBanner('RUGPULL DOWN', 2200); haptic.notify('success');
      setTimeout(() => {
        const st = useGame.getState();
        if (st.screen !== 'game' || st.level !== 5) return;
        st.say([
          { who: 'JACK', text: "It's over. Burn the chain.", color: '#a78bfa' },
          { who: 'TEK', text: 'Airdrop is staged. Every OG holder, no tax.', color: '#38bdf8' },
          { who: 'ROBOFAP', text: 'Burn contract armed. Half the supply is about to disappear.', color: '#22d3ee' },
        ], () => {
          useGame.getState().playCutscene('ending', () => {
            fw.current = false;
            hideBoss.current = true; endProps.current.grave = true;
            useGame.getState().playCutscene('grave', () => {
              const f = useGame.getState();
              f.setTweet(true); haptic.notify('success');
              setTimeout(() => {
                const z = useGame.getState();
                if (z.screen === 'game' && z.level === 5) { z.setTweet(false); z.completeLevel(5); }
              }, 7500);
            });
          });
        });
      }, 4600);
    }
  });

  return (
    <>
      <color attach="background" args={['#070512']} />
      <Rooftop />
      <Storm />
      <Fireworks on={fw} />
      <EndingProps S={endProps} />
      <GunCrate taken={taken} />
      <BossView f={boss} duel={duel} hide={hideBoss} />
      {crewList.map(({ f }) => <CrewView key={f.id} f={f} spawned={spawned} />)}
      <DuelFx duel={duel} jake={jake} />
      <GunFx jake={jake} gun={gun} crew={crew} tracers={tracers} flash={flash} />
      <ThirdPersonController
        spawn={[0, 0, 8]} anim={jake.anim} camDistance={6.4} startYaw={0}
        lockTarget={() => lock}
        canPunch
        onPunch={fire}
      />
    </>
  );
}
