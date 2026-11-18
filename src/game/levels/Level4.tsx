'use client';
import RBox from '@/game/RBox';
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Character from '@/game/characters/Character';
import { Instances, mat4, facadeMaterials, BUILDING_H } from '@/game/world/City';
import { facadeSet, grassTexture, highwayTexture, pavingTexture } from '@/lib/textures';
import { getBushGeo, getPalmGeo, getTreeGeo } from '@/game/world/foliage';
import { getQuality, QUALITY_INFO } from '@/lib/quality';
import { BOX, glow, paint, toon } from '@/game/materials';
import { RaceWorld, RACE, roadPoint, type Biker, type Civ } from '@/lib/RaceSystem';
import { consume, consumeMash, input } from '@/lib/input';
import { rng } from '@/lib/rng';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { PRICE_TARGET } from '@/lib/PriceSystem';
import { clearNav, nav } from '@/lib/nav';
import { newAnim } from '@/lib/anim';
import { engine, sfx } from '@/lib/audio';

const FAIL_PRICE = 14;          // price floor: Red Candle debuff can liquidate you
const QTE_TIME = 5;
const QTE_STEP = 0.085;         // ~12 taps in 5s

/* ------------------------------------------------------------------ vehicles */
const TAU = Math.PI * 2;
const GLASS = new THREE.MeshBasicMaterial({ color: '#8be9ff', transparent: true, opacity: 0.32, depthWrite: false });
const TYRE = new THREE.MeshStandardMaterial({ color: '#0a0a0a' });
const RIM = new THREE.MeshStandardMaterial({ color: '#cbd5e1' });

function Wheels({ x, z, r = 0.38, w = 0.3 }: { x: number; z: number; r?: number; w?: number }) {
  return (<>
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
      <group key={`${sx}${sz}`} position={[sx * x, r, sz * z]}>
        <mesh rotation-z={Math.PI / 2} material={TYRE}><cylinderGeometry args={[r, r, w, 28]} /></mesh>
        <mesh rotation-z={Math.PI / 2} material={RIM} position={[sx * (w / 2 + 0.005), 0, 0]}><cylinderGeometry args={[r * 0.55, r * 0.55, 0.02, 20]} /></mesh>
      </group>
    )))}
  </>);
}

/** Low-poly sports car. Local +Z is the nose. Open cockpit so the crew can be seen. */
export function SportsCar({ color, accent, children }: { color: string; accent: string; children?: ReactNode }) {
  return (
    <group>
      <RBox material={paint(color)} position={[0, 0.36, 0]} size={[1.9, 0.34, 4.4]} />
      <RBox material={paint(color)} position={[0, 0.5, 1.55]} size={[1.72, 0.2, 1.5]} />
      <RBox material={paint(color)} position={[0, 0.62, -1.55]} size={[1.76, 0.3, 1.1]} />
      <RBox material={toon('#0f172a')} position={[0, 0.55, -0.15]} size={[1.5, 0.12, 1.7]} />
      <RBox material={toon('#e5e7eb')} position={[0, 0.61, 1.55]} size={[0.26, 0.02, 1.5]} />
      <RBox material={toon('#e5e7eb')} position={[0, 0.78, -1.55]} size={[0.26, 0.02, 1.1]} />
      <RBox material={GLASS} position={[0, 0.98, 0.72]} rotation-x={-0.55} size={[1.55, 0.55, 0.05]} />
      <RBox material={toon('#0f172a')} position={[0.97, 0.42, 0.3]} size={[0.06, 0.16, 0.9]} />
      <RBox material={toon('#0f172a')} position={[-0.97, 0.42, 0.3]} size={[0.06, 0.16, 0.9]} />
      {[-0.7, 0.7].map((x) => <mesh key={x} geometry={BOX} material={toon('#111827')} position={[x, 0.85, -2.0]} scale={[0.07, 0.3, 0.1]} />)}
      <RBox material={toon(accent)} position={[0, 1.03, -2.05]} size={[2.0, 0.07, 0.55]} />
      <RBox material={glow('#fff6c0')} position={[0.62, 0.52, 2.27]} size={[0.4, 0.1, 0.05]} />
      <RBox material={glow('#fff6c0')} position={[-0.62, 0.52, 2.27]} size={[0.4, 0.1, 0.05]} />
      <RBox material={glow('#ff2d55')} position={[0, 0.66, -2.22]} size={[1.5, 0.07, 0.05]} />
      <RBox material={glow(accent)} position={[0, 0.1, 0]} size={[1.7, 0.04, 3.7]} />
      <Wheels x={0.98} z={1.4} r={0.4} w={0.34} />
      {children}
    </group>
  );
}

/** Civilian car: sedan / taxi / van / pickup. Local +Z is the nose (headlights). */
const CIV_LOOKS = [
  { body: '#64748b', cab: '#1e293b', len: 4.0, hgt: 0.6, cabH: 0.5, cabL: 1.9 },
  { body: '#facc15', cab: '#1e293b', len: 4.0, hgt: 0.6, cabH: 0.5, cabL: 1.9 },
  { body: '#e2e8f0', cab: '#334155', len: 4.6, hgt: 1.15, cabH: 0.2, cabL: 3.9 },
  { body: '#7c3aed', cab: '#1e293b', len: 4.4, hgt: 0.62, cabH: 0.5, cabL: 1.4 },
];
export function CivCar({ kind }: { kind: number }) {
  const k = CIV_LOOKS[kind % CIV_LOOKS.length];
  return (
    <group>
      <RBox material={paint(k.body)} position={[0, 0.3 + k.hgt / 2, 0]} size={[1.85, k.hgt, k.len]} />
      <RBox material={toon(k.cab)} position={[0, 0.3 + k.hgt + k.cabH / 2, kind === 3 ? 0.9 : -0.2]} size={[1.6, k.cabH, k.cabL]} />
      {kind === 1 && <RBox material={glow('#fff')} position={[0, 1.55, -0.2]} size={[0.5, 0.16, 0.25]} />}
      <RBox material={glow('#fff3b0')} position={[0.62, 0.62, k.len / 2 + 0.02]} size={[0.45, 0.2, 0.06]} />
      <RBox material={glow('#fff3b0')} position={[-0.62, 0.62, k.len / 2 + 0.02]} size={[0.45, 0.2, 0.06]} />
      <RBox material={glow('#ff2d55')} position={[0, 0.7, -k.len / 2 - 0.02]} size={[1.4, 0.1, 0.05]} />
      {/* headlight pool on the road: reads from far away through the fog */}
      <mesh position={[0, 0.06, k.len / 2 + 4.2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.6, 8]} /><meshBasicMaterial color="#fff3b0" transparent opacity={0.2} depthWrite={false} toneMapped={false} />
      </mesh>
      <Wheels x={0.9} z={k.len * 0.33} />
    </group>
  );
}

function PlayerRig({ rig, world }: { rig: MutableRefObject<THREE.Group | null>; world: RaceWorld }) {
  const jackAnim = useRef(newAnim());
  const phAnim = useRef(newAnim());
  const meastAnim = useRef(newAnim());
  const flame = useRef<THREE.Group>(null!);
  useFrame(() => {
    const p = world.player;
    const g = rig.current; if (!g) return;
    const pt = roadPoint(p.d, p.x);
    const spin = p.crash > 0 ? (1 - p.crash / RACE.crashTime) * TAU : 0;
    g.rotation.order = 'YXZ';
    g.position.set(pt.x, p.crash > 0 ? Math.abs(Math.sin(spin * 0.5)) * 0.5 : 0, pt.z);
    g.rotation.y = pt.yaw - THREE.MathUtils.clamp(p.vx * 0.02, -0.25, 0.25) + spin;
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -p.vx * 0.012, 0.2);
    jackAnim.current.crouch = p.boosting;
    if (p.barrelCd > RACE.barrelCd - 0.25) meastAnim.current.punch = 1;
    if (p.bump > 0.5 || p.crash > 0) { jackAnim.current.hit = 1; phAnim.current.hit = 1; }
    if (flame.current) { flame.current.visible = p.boosting; flame.current.scale.z = 0.8 + Math.random() * 0.6; }
  });
  return (
    <group ref={rig as MutableRefObject<THREE.Group>}>
      <SportsCar color="#22d3ee" accent="#39ff88">
        <group position={[-0.42, 0.3, -0.05]} scale={0.56}><Character kind="jake" anim={jackAnim} /></group>
        <group position={[0.42, 0.3, -0.05]} scale={0.56}><Character kind="meast" anim={meastAnim} /></group>
        <group position={[0, 0.3, -1.2]} scale={0.5}><Character kind="paperhands" anim={phAnim} /></group>
        <group ref={flame} position={[0, 0.5, -2.5]} visible={false}>
          <mesh geometry={BOX} material={glow('#ff9d2e')} position={[-0.5, 0, -0.5]} scale={[0.3, 0.3, 1.2]} />
          <mesh geometry={BOX} material={glow('#ffe08a')} position={[0.5, 0, -0.5]} scale={[0.3, 0.3, 1.2]} />
        </group>
      </SportsCar>
    </group>
  );
}

function RivalView({ b }: { b: Biker }) {
  const g = useRef<THREE.Group>(null!);
  const anim = useRef(newAnim());
  useFrame(() => {
    const pt = roadPoint(b.d, b.x);
    const down = b.down > 0;
    g.current.position.set(pt.x, down ? Math.abs(Math.sin(b.down * 9)) * 0.7 : 0, pt.z);
    g.current.rotation.order = 'YXZ';
    g.current.rotation.y = pt.yaw + (down ? Math.sin(b.down * 10) * 0.9 : 0);
    g.current.rotation.z = down ? Math.sin(b.down * 14) * 0.4 : 0;
    anim.current.hit = down ? 1 : 0;
  });
  return (
    <group ref={g}>
      <SportsCar color="#ff2d55" accent="#ffd24a">
        <group position={[-0.4, 0.3, -0.05]} scale={0.58}><Character kind="biker" anim={anim} /></group>
      </SportsCar>
    </group>
  );
}

function CivView({ c, world }: { c: Civ; world: RaceWorld }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    const rel = c.d - world.player.d;
    const on = rel > -30 && rel < 210;
    g.current.visible = on;
    if (!on) return;
    const pt = roadPoint(c.d, c.x);
    const hit = c.hit > 0;
    g.current.rotation.order = 'YXZ';
    g.current.position.set(pt.x, hit ? Math.abs(Math.sin(c.hit * 8)) * 0.8 : 0, pt.z);
    g.current.rotation.y = pt.yaw + Math.PI + (hit ? Math.sin(c.hit * 7) * 1.1 : 0);
    g.current.rotation.z = hit ? Math.sin(c.hit * 9) * 0.35 : 0;
  });
  return <group ref={g} visible={false}><CivCar kind={c.kind} /></group>;
}

/* --------------------------------------------------------------------- track */
/** Flat ribbon along the (curvy) road between lateral offsets a..b. */
function ribbon(d0: number, d1: number, step: number, a: number, b: number, y: number, uvAlong = 0) {
  const n = Math.ceil((d1 - d0) / step), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = d0 + i * step, pa = roadPoint(d, a), pb = roadPoint(d, b), v = uvAlong ? d / uvAlong : 0;
    pos.push(pa.x, y, pa.z, pb.x, y, pb.z); uv.push(0, v, 1, v);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

function Track() {
  const q = useMemo(() => QUALITY_INFO[getQuality()], []);
  const d = useMemo(() => {
    const r = rng(77), L = RACE.length, END = L + 260, START = -40;
    const road = ribbon(START, END, 3, -9.2, 9.2, 0, 14);
    const shoulderL = ribbon(START, END, 3, -11.2, -9.2, 0.015, 4), shoulderR = ribbon(START, END, 3, 9.2, 11.2, 0.015, 4);
    const vergeL = ribbon(START, END, 3, -26, -11.2, 0.01, 5), vergeR = ribbon(START, END, 3, 11.2, 26, 0.01, 5);
    const edgeL = ribbon(START, END, 3, -8.95, -8.65, 0.04), edgeR = ribbon(START, END, 3, 8.65, 8.95, 0.04);
    const dashes: THREE.Matrix4[] = [], barriers: THREE.Matrix4[] = [], lamps: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [];
    for (let s = START; s < END; s += 9) for (const o of [-2.25, 2.25]) { const p = roadPoint(s + 2, o); dashes.push(mat4(p.x, 0.045, p.z, 0.2, 0.02, 3.6, p.yaw)); }
    for (let s = START; s < END; s += 6.2) for (const o of [-11.5, 11.5]) { const p = roadPoint(s, o); barriers.push(mat4(p.x, 0.45, p.z, 0.55, 0.9, 6.2, p.yaw)); }
    for (let s = 0; s < END; s += 36) for (const sg of [-1, 1]) {
      const p = roadPoint(s, sg * 13.2), h = roadPoint(s, sg * 11.6);
      lamps.push(mat4(p.x, 3.4, p.z, 0.2, 6.8, 0.2, p.yaw)); heads.push(mat4(h.x, 6.8, h.z, 0.5, 0.18, 1.8, h.yaw));
    }
    // near buildings, bucketed by class so each uses its matching facade texture
    const nearM: THREE.Matrix4[][] = BUILDING_H.map(() => []), nearC: THREE.Color[][] = BUILDING_H.map(() => []);
    const tints = ['#ffffff', '#f3e7d6', '#e4eef6', '#e9e2f0', '#f0e4dc'];
    for (let s = START; s < END + 40; s += 13 + r() * 8) for (const sg of [-1, 1]) {
      const cls = Math.floor(r() * 4), sx = 0.95 + r() * 0.5, p = roadPoint(s, sg * (30 + r() * 10));
      nearM[cls].push(mat4(p.x, BUILDING_H[cls] / 2, p.z, sx, 1, 1 + r() * 0.4, p.yaw)); nearC[cls].push(new THREE.Color(tints[Math.floor(r() * tints.length)]));
    }
    // distant skyline
    const farM: THREE.Matrix4[] = [], farC: THREE.Color[] = [];
    const glassTints = ['#cfe3f6', '#b5d3ee', '#dbe8f4', '#a9c4e0', '#e6eef6'];
    for (let s = -20; s < END + 160; s += 34 + r() * 40) for (const sg of [-1, 1]) {
      const p = roadPoint(s, sg * (62 + r() * 90)), h = 0.6 + r() * 1.35;
      farM.push(mat4(p.x, 45 * h, p.z, 1, h, 1, p.yaw)); farC.push(new THREE.Color(glassTints[Math.floor(r() * glassTints.length)]));
    }
    // roadside greenery
    const palms: THREE.Matrix4[] = [], trees: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [];
    for (let s = START; s < END; s += 10 + r() * 6) for (const sg of [-1, 1]) {
      if (r() > q.trees) continue;
      const p = roadPoint(s, sg * (14.5 + r() * 6)), sc = 0.85 + r() * 0.45;
      (r() < 0.62 ? palms : trees).push(mat4(p.x, 0, p.z, sc, sc, sc, r() * 6.28));
      if (r() < 0.7) { const b = roadPoint(s + r() * 8, sg * (12.4 + r() * 3)); bushes.push(mat4(b.x, 0, b.z, 0.9, 0.9, 0.9, r() * 6)); }
    }
    return { road, shoulderL, shoulderR, vergeL, vergeR, edgeL, edgeR, dashes, barriers, lamps, heads, nearM, nearC, farM, farC, palms, trees, bushes };
  }, [q]);
  const { geos, mats } = useMemo(() => facadeMaterials(), []);
  const mats2 = useMemo(() => {
    const roadTex = highwayTexture().clone(); roadTex.needsUpdate = true;
    const shoulderTex = pavingTexture().clone(); shoulderTex.repeat.set(0.5, 1); shoulderTex.needsUpdate = true;
    const grassTex = grassTexture().clone(); grassTex.repeat.set(4, 1); grassTex.needsUpdate = true;
    const g = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
    // skyline glass tower: its own texture transforms (14 m wide, 90 m tall tile)
    const f = facadeSet(3), clone = (t: THREE.CanvasTexture) => { const c = t.clone(); c.repeat.set(1.75, 90 / 9.6); c.needsUpdate = true; return c; };
    const sky = new THREE.MeshStandardMaterial({ color: '#fff', map: clone(f.map), bumpMap: clone(f.bump), bumpScale: 1.2, emissive: '#fff', emissiveMap: clone(f.emissive), emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.35, envMapIntensity: 1.5 });
    return {
      road: new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.86, metalness: 0.02 }),
      shoulder: new THREE.MeshStandardMaterial({ map: shoulderTex, roughness: 0.95 }),
      grass: g, sky,
      paint: new THREE.MeshStandardMaterial({ color: '#f1f1ec', roughness: 0.7 }),
      barrier: new THREE.MeshStandardMaterial({ color: '#a9a8a3', roughness: 0.9 }),
      pole: new THREE.MeshStandardMaterial({ color: '#4a4e57', roughness: 0.5, metalness: 0.6 }),
      foliage: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    };
  }, []);
  const skyGeo = useMemo(() => new THREE.BoxGeometry(14, 90, 14), []);
  const fin = roadPoint(RACE.length, 0);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, -RACE.length / 2 - 20]}><planeGeometry args={[420, RACE.length + 520]} /><meshStandardMaterial color="#6d7f46" roughness={1} /></mesh>
      <mesh geometry={d.vergeL} material={mats2.grass} />
      <mesh geometry={d.vergeR} material={mats2.grass} />
      <mesh geometry={d.shoulderL} material={mats2.shoulder} />
      <mesh geometry={d.shoulderR} material={mats2.shoulder} />
      <mesh geometry={d.road} material={mats2.road} />
      <mesh geometry={d.edgeL} material={mats2.paint} />
      <mesh geometry={d.edgeR} material={mats2.paint} />
      <Instances geometry={BOX} material={mats2.paint} matrices={d.dashes} />
      <Instances geometry={BOX} material={mats2.barrier} matrices={d.barriers} />
      <Instances geometry={BOX} material={mats2.pole} matrices={d.lamps} />
      <Instances geometry={BOX} material={glow('#fff6dc')} matrices={d.heads} />
      {d.nearM.map((m, i) => <Instances key={i} geometry={geos[i]} material={mats[i]} matrices={m} colors={d.nearC[i]} />)}
      <Instances geometry={skyGeo} material={mats2.sky} matrices={d.farM} colors={d.farC} />
      <Instances geometry={getPalmGeo()} material={mats2.foliage} matrices={d.palms} />
      <Instances geometry={getTreeGeo()} material={mats2.foliage} matrices={d.trees} />
      <Instances geometry={getBushGeo()} material={mats2.foliage} matrices={d.bushes} />
      {/* finish gantry + checker + USB pedestal (local +Z = direction of travel) */}
      <group position={[fin.x, 0, fin.z]} rotation-y={fin.yaw}>
        <mesh geometry={BOX} material={toon('#2a2d33')} position={[-9.8, 4, 0]} scale={[0.6, 8, 0.6]} />
        <mesh geometry={BOX} material={toon('#2a2d33')} position={[9.8, 4, 0]} scale={[0.6, 8, 0.6]} />
        <mesh geometry={BOX} material={toon('#f2f2f0')} position={[0, 8, 0]} scale={[20, 1.4, 0.4]} />
        <mesh geometry={BOX} material={glow('#39ff88')} position={[0, 8, 0.25]} scale={[19, 0.5, 0.06]} />
        {Array.from({ length: 12 }).map((_, i) => <mesh key={i} geometry={BOX} material={toon(i % 2 ? '#111' : '#f5f5f5')} position={[-8.25 + i * 1.5, 0.045, 0]} scale={[1.5, 0.02, 1.5]} />)}
        <mesh geometry={BOX} material={toon('#334155')} position={[0, 0.7, 9]} scale={[2.4, 1.4, 1.4]} />
        <mesh geometry={BOX} material={glow('#22d3ee')} position={[0, 1.45, 8.3]} scale={[0.5, 0.12, 0.08]} />
      </group>
    </group>
  );
}

/* --------------------------------------------------------------------- scene */
export default function Level4() {
  const world = useMemo(() => new RaceWorld(4), []);
  const rig = useRef<THREE.Group | null>(null);
  const barrel = useRef<THREE.Mesh>(null!);
  const fly = useRef<{ t: number; from: THREE.Vector3; target: Biker | null }>({ t: 1, from: new THREE.Vector3(), target: null });
  const st = useRef({
    phase: 'intro' as 'intro' | 'count' | 'race' | 'qte' | 'done' | 'dead',
    count: 0, hudT: 0, price: 0, qte: 0, qteT: 0, shake: 0, warn: false,
  });
  const gate = useRef({ near: 0, honk: 0, pos: 6 });
  const { camera } = useThree();
  const camOff = useRef(0);

  useEffect(() => {
    nav.range = 1; nav.rects = []; nav.markers = []; nav.target = null;
    world.onBump = () => { haptic.impact('heavy'); sfx.bump(); };
    world.onCrash = () => {
      const g = useGame.getState();
      g.setPrice(g.price * (1 - RACE.crashPenalty));
      st.current.shake = 0.5; haptic.notify('error'); sfx.carCrash();
      g.toast(`HEAD-ON! −${Math.round(RACE.crashPenalty * 100)}% FAPCOIN`, 'bad');
    };
    world.onNearMiss = () => {
      const g = useGame.getState();
      world.player.boost = Math.min(RACE.boostMax, world.player.boost + 15);
      sfx.passBy(); haptic.impact('light');
      if (gate.current.near <= 0) { g.toast('CLOSE CALL! +boost', 'good'); gate.current.near = 2.5; }
    };
    engine.start();
    const s = useGame.getState();
    s.setObjective('Finish 1ST! Dodge ONCOMING cars, shake off Red Candle racers — Meast throws barrels (B)');
    s.say([
      { who: 'ROBOFAP', text: 'CEX listing window closes at the finish line. Satoshi Shitoshi left a USB for the final deploy. We have to get there first.', color: '#22d3ee' },
      { who: 'PAPER HANDS', text: "I'm in the BACK SEAT of a supercar?! I'm shaking. I'm literally shaking.", color: '#c084fc' },
      { who: 'JACK', text: 'A / D (or ◀ ▶) switch lanes. Hold Shift to boost. Red Candle cars that stay near you drain 2% of the price EVERY second.', color: '#a78bfa' },
      { who: 'TEK', text: "Heads up — the road is open to traffic. Civilians are coming straight AT you. Watch the headlights, change lanes, or it's a head-on: −10% and you lose your speed. Near misses charge your boost.", color: '#38bdf8' },
      { who: 'MEAST', text: "B throws a barrel. I've got plenty. Don't let the price fall below $14.", color: '#f59e0b' },
      { who: 'ROBOFAP', text: 'CEX only lists the winner. Cross the line in FIRST place or the listing goes to someone else — you will have to rerun it.', color: '#22d3ee' },
    ], () => { st.current.phase = 'count'; st.current.count = 3.2; });
    camera.position.copy(new THREE.Vector3(roadPoint(-9).x, 3.4, 9));
    (camera as THREE.PerspectiveCamera).fov = 62; (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    return () => { world.onBump = undefined; world.onCrash = undefined; world.onNearMiss = undefined; engine.stop(); clearNav(); useGame.getState().setQte(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const S = st.current;
    const p = world.player;
    const busy = g.cutscene || g.dialogue || g.minigame || g.gameOver;

    if (!busy) {
      if (S.phase === 'count') {
        const before = Math.ceil(S.count);
        S.count -= dt;
        const after = Math.ceil(S.count);
        if (after !== before) {
          if (after > 0) { g.showBanner(String(after), 800); haptic.impact('light'); }
          else { g.showBanner('GO!', 900); haptic.notify('success'); S.phase = 'race'; }
        }
      }
      if (S.phase === 'race' || S.phase === 'qte') {
        if (S.phase === 'race') {
          if (consume('left')) { world.switchLane(-1); sfx.lane(); }
          if (consume('right')) { world.switchLane(1); sfx.lane(); }
          gate.current.near = Math.max(0, gate.current.near - dt);
          if (consume('barrel') || consume('special')) {
            const hit = world.throwBarrel();
            if (hit) {
              { const o = roadPoint(p.d + 0.6, p.x); fly.current = { t: 0, from: new THREE.Vector3(o.x, 1.4, o.z), target: hit }; }
              haptic.impact('medium'); g.toast('BARREL! Red Candle down', 'good'); sfx.barrel(); setTimeout(() => sfx.crash(), 380);
            } else if (p.barrelCd > 0) { /* cooling down */ } else g.toast('No biker in range', 'info');
          }
        }
        const wasBoost = p.boosting;
        world.update(dt, S.phase === 'race' && (input.held.boost || input.held.sprint));
        if (p.boosting && !wasBoost) sfx.boost();
        // Red Candle debuff
        if (S.phase === 'race') {
          const cur = g.price;
          const np = world.RedCandleDebuff(cur, dt);
          if (np < cur - 1e-6) { g.setPrice(np); haptic.impact('light'); }
          if (g.price <= FAIL_PRICE) {
            S.phase = 'dead'; haptic.notify('error');
            setTimeout(() => useGame.getState().setGameOver('LIQUIDATED'), 700);
          }
        }
        if (world.finished && S.phase === 'race') {
          const place = world.position();
          if (place !== 1) {
            // CEX only lists the winner's token: anything but 1st = race lost
            S.phase = 'dead'; haptic.notify('error');
            const ord = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][place] ?? `${place}TH`;
            g.showBanner(`FINISHED ${ord} — ONLY 1ST COUNTS`, 2600);
            setTimeout(() => useGame.getState().setGameOver(`${ord} PLACE`), 1800);
            return;
          }
          S.phase = 'qte'; S.qte = 0; S.qteT = QTE_TIME;
          g.setObjective("Plug Satoshi Shitoshi's USB in — MASH E / ACT!");
          g.showBanner('FINISH!', 1400);
          haptic.notify('success');
        }
      }
      if (S.phase === 'qte') {
        S.qteT -= dt;
        if (consumeMash()) { S.qte = Math.min(1, S.qte + QTE_STEP); haptic.impact('light'); S.shake = 0.15; }
        g.setQte({ label: `PLUG IN SHITOSHI'S USB — MASH! ${Math.ceil(Math.max(0, S.qteT))}s`, progress: S.qte });
        if (S.qte >= 1) {
          S.phase = 'done'; g.setQte(null);
          g.setObjective('CEX LISTED!');
          g.showBanner('CEX LISTED ✔', 3800);
          haptic.notify('success');
          g.pump(PRICE_TARGET.l4, 6000);
          setTimeout(() => {
            const s = useGame.getState();
            if (s.screen === 'game' && s.level === 4) s.completeLevel(4);
          }, 8500);
        } else if (S.qteT <= 0) {
          S.qteT = QTE_TIME; S.qte = 0;
          g.toast('USB slipped out! Try again — MASH!', 'bad');
          haptic.notify('error');
        }
      }
    }

    engine.set(S.phase === 'qte' || S.phase === 'done' || S.phase === 'dead' || g.gameOver ? 0 : p.speed, p.boosting);

    // flying barrel visual
    const f = fly.current;
    if (barrel.current) {
      if (f.t < 1 && f.target) {
        f.t += dt / 0.4;
        const tp = roadPoint(f.target.d, f.target.x), tz = tp.z, tx = tp.x;
        barrel.current.visible = true;
        barrel.current.position.set(
          THREE.MathUtils.lerp(f.from.x, tx, f.t),
          1.4 + Math.sin(Math.min(1, f.t) * Math.PI) * 1.4,
          THREE.MathUtils.lerp(f.from.z, tz, f.t),
        );
        barrel.current.rotation.x += dt * 14;
      } else barrel.current.visible = false;
    }

    // HUD ~10 Hz
    S.hudT += dt;
    if (S.hudT > 0.1) {
      S.hudT = 0;
      const warn = S.phase === 'race' && world.threatAhead(p.lane, 60) < Infinity;
      if (warn && !S.warn) sfx.oncoming();
      S.warn = warn;
      const pos = world.position();
      if (S.phase === 'race') { if (pos < gate.current.pos) sfx.overtake(); else if (pos > gate.current.pos) sfx.overtaken(); }
      gate.current.pos = pos;
      g.setRace({
        pos, total: RACE.count + 1, dist: Math.min(1, p.d / RACE.length),
        boost: Math.round(p.boost), barrel: Math.round((1 - p.barrelCd / RACE.barrelCd) * 100), close: world.closeCount(),
        warn, kmh: Math.round(p.speed * 5), crashes: p.crashes,
      });
    }

    // chase camera: follows the road's curvature
    const boost = p.boosting ? 1 : 0;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = THREE.MathUtils.lerp(cam.fov, 62 + boost * 12 + Math.min(10, p.speed * 0.15), 0.1);
    cam.updateProjectionMatrix();
    const shake = S.shake > 0 ? (S.shake -= dt, (Math.random() - 0.5) * 0.25) : 0;
    camOff.current += (p.x * 0.75 - camOff.current) * Math.min(1, 6 * dt);
    const cp = roadPoint(p.d - 9, camOff.current), lp = roadPoint(p.d + 14, p.x * 0.9);
    camera.position.set(cp.x + shake, 3.4 + (S.shake > 0 ? shake * 0.5 : 0), cp.z);
    camera.lookAt(lp.x, 1.2, lp.z);
  });

  return (
    <>
      <Track />
      <PlayerRig rig={rig} world={world} />
      {world.bikers.map((b) => <RivalView key={b.id} b={b} />)}
      {world.civs.map((c) => <CivView key={c.id} c={c} world={world} />)}
      <mesh ref={barrel} visible={false}>
        <cylinderGeometry args={[0.35, 0.35, 0.7, 10]} /><meshStandardMaterial color="#ff7a18" emissive="#ff7a18" emissiveIntensity={0.6} />
      </mesh>
    </>
  );
}
