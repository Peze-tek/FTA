'use client';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import ThirdPersonController from '@/components/ThirdPersonController';
import Character from '@/game/characters/Character';
import { PlayerLight } from '@/game/world/Atmosphere';
import { Instances, mat4 } from '@/game/world/City';
import { BOX, glow, toon } from '@/game/materials';
import { InteractionSystem, registerInteractable } from '@/lib/interact';
import { boxFromCenter, registerColliders, resolveCircle } from '@/lib/colliders';
import { StealthSystem, STEALTH, type Guard } from '@/lib/StealthSystem';
import { input } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { newAnim } from '@/lib/anim';
import { rng } from '@/lib/rng';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';
import { nav, clearNav, setNavTarget, tileRoute } from '@/lib/nav';

/** Rugged Pub basement. # wall, . floor, S start, C cage (13 cages, 200 OG holders total), T terminal. */
const MAP = [
  '#########################',
  '#S..#.......#...........#',
  '#...#..C.C..#..C..C..C..#',
  '#...#.......#...........#',
  '#...##.###.##.###.#######',
  '#.......................#',
  '#...#####.#####.#####...#',
  '#...#C.C#.#C.C#.#C.C#...#',
  '#...#...#.#...#.#...#...#',
  '#...##.##.##.##.##.##...#',
  '#.......................#',
  '#.####.#########.####...#',
  '#.#C.#.#.......#.#C.#...#',
  '#.#..#.#...T...#.#..#...#',
  '#.##.#.#.......#.##.#...#',
  '#.......................#',
  '#########################',
];
const TS = 4; // tile size (m)
const W = MAP[0].length, H = MAP.length;
const TOTAL = 200;
const WALL_H = 4.5;

/** Guard patrol routes in tile coords [col,row] (ping-pong). Every tile must be open floor. */
const GUARD_PATHS: [number, number][][] = [
  [[2, 5], [22, 5]],
  [[22, 10], [2, 10]],
  [[2, 15], [22, 15]],
  [[22, 6], [22, 14]],
];
const GUARD_START = [0, 0, 1, 0];

const w3 = (c: number, r: number) => new THREE.Vector3(c * TS, 0, r * TS);

function parse() {
  const walls: { c: number; r: number }[] = [];
  const cages: { c: number; r: number }[] = [];
  let start = { c: 1, r: 1 }, term = { c: 11, r: 13 };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = MAP[r][c];
    if (ch === 'C') cages.push({ c, r });
    if (ch === 'S') start = { c, r };
    if (ch === 'T') term = { c, r };
    if (ch === '#') {
      // only keep walls that touch open space (interior blocks are never seen or hit)
      let open = false;
      for (let dr = -1; dr <= 1 && !open; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W && MAP[rr][cc] !== '#') { open = true; break; }
      }
      if (open) walls.push({ c, r });
    }
  }
  return { walls, cages, start, term };
}

/* ------------------------------------------------------------------ visuals */
function Floor() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#1b1620'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#221b29'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
    x.strokeStyle = '#0d0a12'; x.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W, H); t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (<>
    <mesh rotation-x={-Math.PI / 2} position={[(W - 1) * TS / 2, 0, (H - 1) * TS / 2]}>
      <planeGeometry args={[W * TS, H * TS]} />
      <meshLambertMaterial map={tex} />
    </mesh>
    {/* ceiling: faces down, so it is invisible from a camera above it */}
    <mesh rotation-x={Math.PI / 2} position={[(W - 1) * TS / 2, WALL_H, (H - 1) * TS / 2]}>
      <planeGeometry args={[W * TS, H * TS]} />
      <meshBasicMaterial color="#0b0710" />
    </mesh>
  </>);
}

function Walls({ walls }: { walls: { c: number; r: number }[] }) {
  const { m, c } = useMemo(() => {
    const r = rng(5);
    return {
      m: walls.map((w) => mat4(w.c * TS, WALL_H / 2, w.r * TS, TS, WALL_H, TS)),
      c: walls.map(() => new THREE.Color().setHSL(0.78, 0.18, 0.16 + r() * 0.06)),
    };
  }, [walls]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), []);
  return <Instances geometry={BOX} material={mat} matrices={m} colors={c} />;
}

function CeilingLights() {
  const m = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const r of [5, 10, 15]) for (let c = 2; c < W - 1; c += 4) out.push(mat4(c * TS, WALL_H - 0.1, r * TS, 1.8, 0.1, 0.5));
    for (const [c, r] of [[2, 2], [8, 2], [18, 2], [6, 8], [12, 8], [18, 8], [11, 13], [3, 13]]) out.push(mat4(c * TS, WALL_H - 0.1, r * TS, 1.4, 0.1, 0.5));
    return out;
  }, []);
  return <Instances geometry={BOX} material={glow('#ff9aa8')} matrices={m} />;
}

/** Cage bars: one instanced mesh for every standing cage. Rebuilt (cheaply) when a cage breaks. */
function CageBars({ cages, broken }: { cages: { c: number; r: number }[]; broken: number[] }) {
  const m = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    cages.forEach((cg, i) => {
      if (broken.includes(i)) return;
      const x = cg.c * TS, z = cg.r * TS;
      for (const bx of [-1.7, -0.57, 0.57, 1.7]) for (const sz of [-1.7, 1.7]) out.push(mat4(x + bx, 1.5, z + sz, 0.11, 3, 0.11));
      for (const bz of [-0.57, 0.57]) for (const sx of [-1.7, 1.7]) out.push(mat4(x + sx, 1.5, z + bz, 0.11, 3, 0.11));
      out.push(mat4(x, 3.05, z, 3.6, 0.14, 3.6));
    });
    return out;
  }, [cages, broken]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#8a8aa0' }), []);
  return <Instances geometry={BOX} material={mat} matrices={m} />;
}

/** Pillars of light over unbroken cages so you can spot them over the walls. */
function CageBeacons({ cages, broken }: { cages: { c: number; r: number }[]; broken: number[] }) {
  const m = useMemo(() => cages.filter((_, i) => !broken.includes(i)).map((cg) => mat4(cg.c * TS, 8, cg.r * TS, 0.35, 16, 0.35)), [cages, broken]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), []);
  return <Instances geometry={BOX} material={mat} matrices={m} />;
}

/** All 200 OG holders as two instanced meshes (bodies + heads). They sulk in cages, then party when freed. */
function Holders({ cages, per, brokenRef }: { cages: { c: number; r: number }[]; per: number[]; brokenRef: MutableRefObject<Set<number>> }) {
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const heads = useRef<THREE.InstancedMesh>(null!);
  const lastCount = useRef(-1);
  const data = useMemo(() => {
    const r = rng(99);
    const out: { cage: number; ox: number; oz: number; ph: number }[] = [];
    cages.forEach((_, ci) => { for (let k = 0; k < per[ci]; k++) out.push({ cage: ci, ox: (r() - 0.5) * 2.6, oz: (r() - 0.5) * 2.6, ph: r() * 6.28 }); });
    return out;
  }, [cages, per]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colA = useMemo(() => new THREE.Color('#6b7280'), []);
  const colB = useMemo(() => new THREE.Color('#39ff88'), []);
  const headMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#c68a5c' }), []);
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), []);
  const bodyGeo = useMemo(() => new THREE.BoxGeometry(0.38, 0.62, 0.26), []);
  const headGeo = useMemo(() => new THREE.BoxGeometry(0.26, 0.26, 0.26), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const b = bodies.current, h = heads.current;
    if (!b || !h) return;
    const recolor = brokenRef.current.size !== lastCount.current;
    data.forEach((d, i) => {
      const freed = brokenRef.current.has(d.cage);
      const cg = cages[d.cage];
      const spread = freed ? 1.5 : 1;
      const jump = freed ? Math.abs(Math.sin(t * 5 + d.ph)) * 0.55 : Math.sin(t * 1.5 + d.ph) * 0.02;
      const x = cg.c * TS + d.ox * spread, z = cg.r * TS + d.oz * spread;
      dummy.rotation.set(0, d.ph + (freed ? t * 2 : 0), 0);
      dummy.position.set(x, 0.31 + jump, z); dummy.updateMatrix(); b.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.75 + jump, z); dummy.updateMatrix(); h.setMatrixAt(i, dummy.matrix);
      if (recolor) b.setColorAt(i, freed ? colB : colA);
    });
    b.instanceMatrix.needsUpdate = true; h.instanceMatrix.needsUpdate = true;
    if (recolor && b.instanceColor) { b.instanceColor.needsUpdate = true; lastCount.current = brokenRef.current.size; }
  });
  return (<>
    <instancedMesh ref={bodies} args={[bodyGeo, bodyMat, data.length]} frustumCulled={false} />
    <instancedMesh ref={heads} args={[headGeo, headMat, data.length]} frustumCulled={false} />
  </>);
}

/* ------------------------------------------------------------------- guards */
function GuardView({ g }: { g: Guard }) {
  const grp = useRef<THREE.Group>(null!);
  const cone = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => new THREE.CircleGeometry(STEALTH.range, 20, Math.PI / 2 - STEALTH.halfFov, STEALTH.halfFov * 2), []);
  useFrame(() => {
    grp.current.position.copy(g.pos);
    grp.current.rotation.y = g.yaw;
    const m = cone.current.material as THREE.MeshBasicMaterial;
    m.color.set(g.state === 'chase' ? '#ff2d55' : g.state === 'patrol' ? '#9be7ff' : '#fbbf24');
  });
  return (
    <group ref={grp}>
      <Character kind="guard" anim={g.anim} />
      <mesh ref={cone} geometry={geo} rotation-x={Math.PI / 2} position-y={0.07}>
        <meshBasicMaterial transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------- Meast */
function Meast({ working, workPos }: { working: MutableRefObject<boolean>; workPos: MutableRefObject<THREE.Vector3> }) {
  const grp = useRef<THREE.Group>(null!);
  const anim = useRef(newAnim());
  const pos = useRef(new THREE.Vector3());
  const hit = useRef(0);
  const init = useRef(false);
  const stuck = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = playerState.pos;
    if (!init.current) { pos.current.set(p.x + 1.5, 0, p.z + 1.5); init.current = true; }
    const f = playerState.facing;
    let tx: number, tz: number, face: number | null = null;
    if (working.current) {
      const wp = workPos.current;
      const dx = p.x - wp.x, dz = p.z - wp.z, d = Math.hypot(dx, dz) || 1;
      tx = wp.x + (dx / d) * 2.4; tz = wp.z + (dz / d) * 2.4;
      face = Math.atan2(wp.x - pos.current.x, wp.z - pos.current.z);
      hit.current -= dt;
      if (hit.current <= 0) { anim.current.punch = 1; hit.current = 0.5; }
    } else {
      tx = p.x - Math.sin(f) * 1.6 + Math.cos(f) * 1.5;
      tz = p.z - Math.cos(f) * 1.6 - Math.sin(f) * 1.5;
    }
    const dx = tx - pos.current.x, dz = tz - pos.current.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      const sp = Math.min(d * 3, d > 6 ? 9 : 5.2);
      pos.current.x += (dx / d) * sp * dt; pos.current.z += (dz / d) * sp * dt;
      anim.current.speed = Math.min(1, sp / 5);
      if (face === null) face = Math.atan2(dx, dz);
    } else anim.current.speed *= 0.8;
    if (face !== null) {
      let diff = face - grp.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      grp.current.rotation.y += diff * Math.min(1, dt * 10);
    }
    const before = pos.current.x + pos.current.z * 1e-3;
    resolveCircle(pos.current, 0.7); // keep Meast out of walls/cages
    // never lose him: if he lags far behind or gets wedged on a wall/cage, he catches up next to Jack
    const far = Math.hypot(p.x - pos.current.x, p.z - pos.current.z);
    const wf = working.current ? workPos.current.distanceTo(pos.current) : 0;
    stuck.current = (d > 1 && (far > 3 || (working.current && wf > 4)) && Math.abs(before - (pos.current.x + pos.current.z * 1e-3)) > 1e-4) ? stuck.current + dt : Math.max(0, stuck.current - dt);
    if (far > 7.5 || stuck.current > 1.2) {
      stuck.current = 0;
      const offs: [number, number][] = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [0.8, 0.8], [-0.8, -0.8]];
      for (const [ox, oz] of offs) {
        pos.current.set(p.x + ox, 0, p.z + oz);
        const bx = pos.current.x, bz = pos.current.z;
        resolveCircle(pos.current, 0.7);
        if (Math.hypot(pos.current.x - bx, pos.current.z - bz) < 0.05) break;
      }
      anim.current.speed = 0;
    }
    grp.current.position.set(pos.current.x, 0, pos.current.z);
  });
  return <group ref={grp}><Character kind="meast" label="MEAST" anim={anim} /></group>;
}

/* --------------------------------------------------------------- terminal */
function Terminal({ pos, ready }: { pos: THREE.Vector3; ready: boolean }) {
  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh geometry={BOX} material={toon('#262033')} position={[0, 0.6, 0]} scale={[2.2, 1.2, 1]} />
      <mesh geometry={BOX} material={toon('#0b0b12')} position={[0, 1.7, -0.2]} rotation-x={-0.2} scale={[2, 1.2, 0.12]} />
      <mesh geometry={BOX} material={glow(ready ? '#39ff88' : '#ff2d55')} position={[0, 1.7, -0.12]} rotation-x={-0.2} scale={[1.8, 1.0, 0.04]} />
      {ready && (
        <mesh position={[0, 6, 0]} geometry={BOX} scale={[0.5, 12, 0.5]}>
          <meshBasicMaterial color="#39ff88" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ----------------------------------------------------------------- systems */
function Systems(props: {
  map: ReturnType<typeof parse>; stealth: StealthSystem; per: number[];
  brokenRef: MutableRefObject<Set<number>>; progress: MutableRefObject<number[]>;
  setBroken: (b: number[]) => void; working: MutableRefObject<boolean>; workPos: MutableRefObject<THREE.Vector3>;
}) {
  const { map, stealth, per, brokenRef, progress, setBroken, working, workPos } = props;
  const noiseT = useRef(0);
  const routeKey = useRef('');
  const lastQ = useRef(-1);
  const startPos = useMemo(() => w3(map.start.c, map.start.r), [map]);
  const centers = useMemo(() => map.cages.map((c) => w3(c.c, c.r)), [map]);
  const termPos = useMemo(() => w3(map.term.c, map.term.r), [map]);

  const breakCage = (i: number) => {
    brokenRef.current.add(i);
    setBroken(Array.from(brokenRef.current));
    progress.current[i] = 0;
    const s = useGame.getState();
    s.addFreed(per[i]); sfx.cage();
    const n = useGame.getState().freed;
    s.toast(`MEAST smashed the cage! +${per[i]} OGs freed (${n}/${TOTAL})`, 'good');
    haptic.notify('success'); haptic.impact('heavy');
    stealth.noise(centers[i], 18); // loud!
  };

  // each cage is an interactable: tapping ACT adds a burst of progress (mobile-friendly alternative to holding F)
  useEffect(() => {
    const offs = centers.map((c, i) => registerInteractable({
      id: `cage-${i}`, x: c.x, z: c.z, radius: 3.7, label: 'Hold F — Meast breaks the cage',
      enabled: () => !brokenRef.current.has(i),
      onUse: () => { progress.current[i] = Math.min(1, progress.current[i] + 0.28); stealth.noise(c, 9); haptic.impact('medium'); },
    }));
    return () => offs.forEach((o) => o());
  }, [centers, brokenRef, progress, stealth]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGame.getState();
    if (s.cutscene || s.dialogue || s.minigame) { working.current = false; return; }

    // --- minimap feed: standing cages + live guards, and the guide to the next objective
    const mk = nav.markers; mk.length = 0;
    let nearestAny = -1, nad = Infinity;
    centers.forEach((c, i) => {
      if (brokenRef.current.has(i)) return;
      mk.push({ x: c.x, z: c.z, color: '#ff4fd8', kind: 'poi' });
      const d = Math.hypot(c.x - playerState.pos.x, c.z - playerState.pos.z);
      if (d < nad) { nad = d; nearestAny = i; }
    });
    stealth.guards.forEach((g) => mk.push({
      x: g.pos.x, z: g.pos.z, kind: 'enemy',
      color: g.state === 'chase' ? '#ff2d55' : g.state === 'patrol' ? '#9be7ff' : '#fbbf24',
    }));
    if (s.freed >= TOTAL) setNavTarget(termPos.x, termPos.z, '#39ff88', 'Terminal');
    else if (nearestAny >= 0) setNavTarget(centers[nearestAny].x, centers[nearestAny].z, '#ff4fd8', 'Nearest cage');
    // route through the corridors (BFS), recomputed only when Jack changes tile or the target changes
    nav.routeMode = 'path';
    const tgt = nav.target;
    if (tgt) {
      const k = `${Math.round(playerState.pos.x / TS)},${Math.round(playerState.pos.z / TS)}>${Math.round(tgt.x)},${Math.round(tgt.z)}`;
      if (k !== routeKey.current) { routeKey.current = k; nav.route = tileRoute(MAP, TS, playerState.pos, tgt); }
    } else nav.route = null;

    // --- stealth
    const r = stealth.update(dt, {
      pos: playerState.pos, crouching: playerState.crouching, moving: playerState.moving, speed: playerState.speed,
    });
    const m = Math.round(r.meter);
    if (m !== s.stealth) s.setStealth(m);
    if (r.caught) {
      stealth.reset();
      playerState.pos.copy(startPos); playerState.impulse.set(0, 0, 0);
      s.setStealth(0); s.setQte(null);
      progress.current = progress.current.map(() => 0);
      // caught = the captives are rounded up again: every cage is rebuilt, start the whole rescue over
      brokenRef.current.clear(); setBroken([]); s.resetFreed();
      s.showBanner('CAUGHT! CAPTIVES RE-CAGED', 2600);
      s.toast('SPOTTED! Dragged back to the entrance. All 200 OGs were locked up again — free them from the start.', 'bad');
      haptic.notify('error');
      return;
    }

    // --- cages: hold F (or tap ACT) near a cage and Meast smashes it
    let near = -1, nd = 3.8;
    centers.forEach((c, i) => {
      if (brokenRef.current.has(i)) return;
      const d = Math.hypot(c.x - playerState.pos.x, c.z - playerState.pos.z);
      if (d < nd) { nd = d; near = i; }
    });
    const holding = input.held.hold && near >= 0;
    working.current = holding;
    if (holding) {
      workPos.current.copy(centers[near]);
      progress.current[near] = Math.min(1, progress.current[near] + dt / 1.7);
      noiseT.current -= dt;
      if (noiseT.current <= 0) { stealth.noise(centers[near], 11); noiseT.current = 0.5; haptic.impact('light'); }
    }
    progress.current.forEach((p, i) => {
      if (i !== near || !holding) progress.current[i] = Math.max(0, p - dt * 0.5);
    });
    for (let i = 0; i < progress.current.length; i++) {
      if (progress.current[i] >= 1 && !brokenRef.current.has(i)) breakCage(i);
    }
    // publish the QTE bar (throttled)
    const pv = near >= 0 ? progress.current[near] : 0;
    const key = pv > 0.01 ? Math.round(pv * 50) : -1;
    if (key !== lastQ.current) {
      lastQ.current = key;
      s.setQte(key >= 0 ? { label: 'MEAST SMASHES THE CAGE — HOLD F', progress: pv } : null);
    }
  });
  return null;
}

/* -------------------------------------------------------------------- level */
export default function Level2() {
  const map = useMemo(parse, []);
  const walls = useMemo(() => map.walls.map((w) => boxFromCenter(w.c * TS, w.r * TS, TS, TS)), [map]);
  const stealth = useMemo(() => new StealthSystem(GUARD_PATHS.map((p) => p.map(([c, r]) => w3(c, r))), walls, GUARD_START), [walls]);
  const per = useMemo(() => map.cages.map((_, i) => Math.floor(TOTAL / map.cages.length) + (i < TOTAL % map.cages.length ? 1 : 0)), [map]);
  const [broken, setBroken] = useState<number[]>([]);
  const brokenRef = useRef(new Set<number>());
  const progress = useRef<number[]>(map.cages.map(() => 0));
  const working = useRef(false);
  const workPos = useRef(new THREE.Vector3());
  const freed = useGame((s) => s.freed);
  const termPos = useMemo(() => w3(map.term.c, map.term.r), [map]);
  const spawn = useMemo<[number, number, number]>(() => [map.start.c * TS, 0, map.start.r * TS], [map]);

  useEffect(() => registerColliders('l2walls', walls), [walls]);
  useEffect(() => {
    nav.range = 28;
    nav.rects = [
      { x: (W - 1) * TS / 2, z: (H - 1) * TS / 2, w: W * TS, d: H * TS, color: '#1d1726' }, // floor
      ...map.walls.map((w) => ({ x: w.c * TS, z: w.r * TS, w: TS, d: TS, color: '#5a4b70' })),
    ];
    return () => clearNav();
  }, [map]);
  useEffect(() => registerColliders('l2cages', [
    ...map.cages.filter((_, i) => !broken.includes(i)).map((c) => boxFromCenter(c.c * TS, c.r * TS, 3.5, 3.5)),
    boxFromCenter(termPos.x, termPos.z, 2.4, 1.2),
  ]), [map, broken, termPos]);

  // objective + intro banter
  useEffect(() => {
    const s = useGame.getState();
    s.setObjective(freed >= TOTAL ? 'All 200 OGs free! Hack the terminal' : `Free the caged OGs (${freed}/${TOTAL}) — hold F near a cage`);
  }, [freed]);
  useEffect(() => {
    useGame.getState().say([
      { who: 'JACK', text: "Rugpull keeps 200 OG holders in cages under his pub. We get them all out. Quietly.", color: '#a78bfa' },
      { who: 'MEAST', text: "Quiet is for people who don't lift. Point me at a cage.", color: '#f59e0b' },
      { who: 'JACK', text: 'Stay out of the guards\' light cones. Crouch (C) to shrink how far they see you. Hold F near a cage so Meast can smash it — it\'s LOUD.', color: '#a78bfa' },
    ]);
  }, []);

  // the terminal: opens the "dump Rugpull's shitcoin, NOT FAPCOIN" hack puzzle
  useEffect(() => registerInteractable({
    id: 'terminal', x: termPos.x, z: termPos.z, radius: 3.4, label: "Hack Rugpull's terminal",
    enabled: () => useGame.getState().freed >= TOTAL,
    onUse: () => useGame.getState().setMinigame('dump'),
  }), [termPos]);

  return (
    <>
      <color attach="background" args={['#0d0610']} />
      <fogExp2 attach="fog" args={['#140813', 0.035]} />
      <PlayerLight />
      <Floor />
      <Walls walls={map.walls} />
      <CeilingLights />
      <CageBars cages={map.cages} broken={broken} />
      <CageBeacons cages={map.cages} broken={broken} />
      <Holders cages={map.cages} per={per} brokenRef={brokenRef} />
      <Terminal pos={termPos} ready={freed >= TOTAL} />
      {stealth.guards.map((g) => <GuardView key={g.id} g={g} />)}
      <ThirdPersonController spawn={spawn} canPunch={false} startYaw={Math.PI} camDistance={3.7} camMaxY={4.2} speed={5.2} />
      <Meast working={working} workPos={workPos} />
      <Systems map={map} stealth={stealth} per={per} brokenRef={brokenRef} progress={progress} setBroken={setBroken} working={working} workPos={workPos} />
      <InteractionSystem />
    </>
  );
}
