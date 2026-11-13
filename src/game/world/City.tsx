'use client';
import OuterCity from '@/game/world/OuterCity';
import Graffiti from '@/game/world/Graffiti';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { getQuality } from '@/lib/quality';
import { ROUTES, BUILDING_ROWS, rowZ, DISTRICTS, WORLD, type DistrictDef, type Landmark } from '@/game/data/districts';
import { rng } from '@/lib/rng';
import { registerColliders, boxFromCenter, type AABB } from '@/lib/colliders';
import { useGame } from '@/lib/store';
import { playerState } from '@/lib/playerState';
import { BOX, toon, glow } from '@/game/materials';
import { formatPrice, isDistrictUnlocked } from '@/lib/PriceSystem';
import { haptic } from '@/lib/telegram';
import { cityRoadTexture, crosswalkTexture, facadeSet, grassTexture, pavingTexture } from '@/lib/textures';
import { getBushGeo, getCarGeo, getPalmGeo, getTreeGeo } from '@/game/world/foliage';
import { getQuality, QUALITY_INFO } from '@/lib/quality';
import { LAPTOP_POS, RECRUIT_QUESTS } from '@/game/data/quests';

/* ------------------------------------------------------------------ helpers */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function mat4(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  _q.setFromEuler(_e.set(0, ry, 0));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

/** One draw call for N copies of a mesh. */
/** Draw radius for the big open-mode city, by graphics quality (instances further away than this aren't drawn at all). */
export const cullRadius = () => ({ low: 115, med: 165, high: 240 }[getQuality()]);

export function Instances({ geometry, material, matrices, colors, cast, cull }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; cast?: boolean; cull?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => { const a = new Float32Array(matrices.length * 2); matrices.forEach((m, i) => { a[i * 2] = m.elements[12]; a[i * 2 + 1] = m.elements[14]; }); return a; }, [matrices]);
  const last = useRef({ x: 1e9, z: 1e9 });
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mx, i) => { m.setMatrixAt(i, mx); if (colors) m.setColorAt(i, colors[i]); });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    last.current.x = 1e9;
  }, [matrices, colors]);
  // streaming: rewrite only the instances near the camera, every ~12 m of movement
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!cull || !m) return;
    const cx = camera.position.x, cz = camera.position.z, l = last.current;
    if (Math.abs(cx - l.x) < 12 && Math.abs(cz - l.z) < 12) return;
    l.x = cx; l.z = cz;
    const arr = m.instanceMatrix.array as Float32Array, carr = m.instanceColor?.array as Float32Array | undefined;
    let k = 0;
    for (let i = 0; i < matrices.length; i++) {
      if (Math.abs(pts[i * 2] - cx) > cull || Math.abs(pts[i * 2 + 1] - cz) > cull) continue;
      matrices[i].toArray(arr, k * 16);
      if (carr && colors) colors[i].toArray(carr, k * 3);
      k++;
    }
    m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  if (!matrices.length) return null;
  return <instancedMesh key={matrices.length} ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} castShadow={!!cast} receiveShadow={!!cast} />;
}

/* ---------------------------------------------------------------- buildings */
const CLASS_H = [9, 16, 28, 44];

interface Bld { x: number; z: number; cls: number; color: string }
const bldCache = new Map<string, Bld[]>();
/** routes = true carves the Level 1 side streets + alleys out of the building rows. */
export function genBuildings(d: DistrictDef, routes = false): Bld[] {
  const key = `${d.id}${routes ? 'r' : ''}`;
  const hit = bldCache.get(key);
  if (hit) return hit;
  const r = rng(d.id * 977 + 13);
  const out: Bld[] = [];
  for (let ix = 0; ix < 10; ix++) for (const side of [-1, 1]) for (let row = 0; row < BUILDING_ROWS; row++) {
    const gap = r() < 0.07 && row > 0;   // random alley gaps
    const roll = r();
    let acc = 0, cls = 0;
    for (let i = 0; i < 4; i++) { acc += d.heightWeights[i]; if (roll <= acc) { cls = i; break; } cls = i; }
    const bx = d.cx - 45 + ix * 10 + (r() - 0.5) * 0.6, color = d.palette[Math.floor(r() * d.palette.length)];
    if (gap) continue;
    if (routes && ROUTES.some((q) => q.district === d.id && q.dir === side && (
      (Math.abs(bx - q.sx) < 5 && row <= q.row) ||
      (row === q.row && bx > Math.min(q.sx, q.ax) - 5 && bx < Math.max(q.sx, q.ax) + 5)))) continue;
    out.push({ x: bx, z: side * (28 + row * 10), cls, color });
  }
  bldCache.set(key, out);
  return out;
}

/** Daytime tints (multiplied with the facade texture) per district style. */
const DAY_PAL: Record<string, string[]> = {
  market: ['#ffffff', '#f6e8d4', '#ecd2b0', '#dfeae4', '#f3dcd2'],
  london: ['#ece8f4', '#e0d4e6', '#d6e0ee', '#f3e4e4'],
  portharcourt: ['#f2e4cc', '#ddd4bc', '#eadacb', '#d3dcd4'],
  finance: ['#d4e8f8', '#c0d8f0', '#dcebf8', '#c8daea'],
};

export const BUILDING_H = CLASS_H;
let _fm: { geos: THREE.BoxGeometry[]; mats: THREE.MeshStandardMaterial[] } | null = null;
/** Shared facade materials (one per building class) + matching 8 m-wide geometries. Used by the city and the race road. */
export function facadeMaterials() {
  if (_fm) return _fm;
  const geos = CLASS_H.map((h) => new THREE.BoxGeometry(8, h, 8));
  const mats = CLASS_H.map((h, i) => {
    const f = facadeSet(i);
    [f.map, f.bump, f.emissive].forEach((t) => t.repeat.set(1, h / 9.6));
    const glass = i >= 2;
    return new THREE.MeshStandardMaterial({
      color: '#ffffff', map: f.map, bumpMap: f.bump, bumpScale: 1.4, emissive: '#ffffff', emissiveMap: f.emissive, emissiveIntensity: 0.7,
      roughness: glass ? 0.3 : 0.85, metalness: glass ? 0.3 : 0.02, envMapIntensity: glass ? 1.4 : 0.5,
    });
  });
  _fm = { geos, mats };
  return _fm;
}

/** All districts' tower blocks with textured facades (plaster / brick / office ribbons / glass curtain wall), 4 draw calls. */
function Buildings({ routes }: { routes: boolean }) {
  const { per, geos, mats } = useMemo(() => {
    const per: { m: THREE.Matrix4[]; c: THREE.Color[] }[] = CLASS_H.map(() => ({ m: [], c: [] }));
    DISTRICTS.forEach((d) => genBuildings(d, routes).forEach((b, i) => {
      per[b.cls].m.push(mat4(b.x, CLASS_H[b.cls] / 2, b.z, 1, 1, 1));
      const pal = DAY_PAL[d.style];
      per[b.cls].c.push(new THREE.Color(pal[i % pal.length]));
    }));
    const { geos, mats } = facadeMaterials();
    return { per, geos, mats };
  }, [routes]);
  return <>{per.map((p, i) => <Instances key={i} geometry={geos[i]} material={mats[i]} matrices={p.m} colors={p.c} />)}</>;
}

/* ------------------------------------------------------------- street props */
interface PropDef { w: number; h: number; d: number; body: string; accent: string }
interface PropPlace { x: number; z: number; def: PropDef }

function genProps(d: DistrictDef): PropPlace[] {
  const r = rng(d.id * 4321 + 5);
  const out: PropPlace[] = [];
  const free = (x: number) => !d.landmarks.some((l) => Math.abs(l.pos[0] - x) < l.size[0] / 2 + 3 && false);
  const tarp = ['#ff4d4d', '#ffd23f', '#3ddc97', '#4dabf7', '#ff7ad9', '#ff9f43'];
  for (let i = 0; i < 12; i++) {
    const x = d.cx - 44 + i * 7.5 + r() * 2;
    const z = (r() < 0.5 ? -1 : 1) * (9.8 + r() * 0.4);
    if (!free(x)) continue;
    if (d.style === 'market') out.push({ x, z, def: { w: 2.4, h: 1.1, d: 1.4, body: '#7a4b24', accent: tarp[Math.floor(r() * tarp.length)] } });
    if (d.style === 'london') out.push({ x, z, def: r() < 0.5
      ? { w: 0.9, h: 2.4, d: 0.9, body: '#c1121f', accent: '#9be7ff' }
      : { w: 0.3, h: 3.6, d: 0.3, body: '#222233', accent: r() < 0.5 ? '#ff4fd8' : '#22d3ee' } });
    if (d.style === 'portharcourt') out.push({ x, z, def: r() < 0.6
      ? { w: 3, h: 2.5, d: 2, body: ['#6b3f27', '#5a4a3a', '#7b4a2a'][Math.floor(r() * 3)], accent: '#8a8f98' }
      : { w: 0.8, h: 1.1, d: 0.8, body: '#d97706', accent: '#ff7a18' } });
    if (d.style === 'finance') out.push({ x, z, def: { w: 1.4, h: 3.2, d: 0.5, body: '#0b1220', accent: r() < 0.7 ? '#39ff88' : '#ff2d55' } });
  }
  if (d.style === 'market') { // parked danfo buses
    for (const [x, z] of [[-18, 6.4], [10, -6.4], [38, 6.4]] as const)
      out.push({ x: d.cx + x, z, def: { w: 5.5, h: 2.4, d: 2.2, body: '#f5c211', accent: '#111111' } });
  }
  return out;
}

function Props({ d }: { d: DistrictDef }) {
  const places = useMemo(() => genProps(d), [d]);
  const { bm, am, ac, bc } = useMemo(() => ({
    bm: places.map((p) => mat4(p.x, p.def.h / 2, p.z, p.def.w, p.def.h, p.def.d)),
    am: places.map((p) => mat4(p.x, p.def.h + 0.12, p.z, p.def.w * 1.08, 0.25, p.def.d * 1.08)),
    ac: places.map((p) => new THREE.Color(p.def.accent)),
    bc: places.map((p) => new THREE.Color(p.def.body)),
  }), [places]);
  useEffect(() => registerColliders(`props${d.id}`, places.map((p) => boxFromCenter(p.x, p.z, p.def.w, p.def.d))), [places, d.id]);
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), []);
  const accMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  return (<>
    <Instances geometry={BOX} material={bodyMat} matrices={bm} colors={bc} />
    <Instances geometry={BOX} material={accMat} matrices={am} colors={ac} />
  </>);
}

/* ------------------------------------------------------------------- lamps */
function Lamps({ d }: { d: DistrictDef }) {
  const { poles, heads, cones } = useMemo(() => {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], cones: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
      const x = d.cx - 42 + i * 14 + (s > 0 ? 7 : 0);
      const z = s * 9.3;
      poles.push(mat4(x, 2.6, z, 0.2, 5.2, 0.2));
      heads.push(mat4(x, 5.3, z - s * 0.4, 0.9, 0.25, 0.6));
      cones.push(mat4(x, 2.55, z - s * 0.4, 1, 1, 1));
    }
    return { poles, heads, cones };
  }, [d]);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(2.6, 5.1, 10, 1, true), []);
  const coneMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd9a0', transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), []);
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.5, metalness: 0.6 }), []);
  return (<>
    <Instances geometry={BOX} material={poleMat} matrices={poles} />
    <Instances geometry={BOX} material={glow('#ffe2a8')} matrices={heads} />
    <Instances geometry={coneGeo} material={coneMat} matrices={cones} />
  </>);
}

/* --------------------------------------------------------------- landmarks */
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: '#7fb4d8', roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 });
function LandmarkView({ l }: { l: Landmark }) {
  const [w, h, d] = l.size;
  const faceZ = l.pos[1] < 0 ? 1 : -1; // door faces the street
  const signY = Math.min(h - 0.8, 4.8);
  return (
    <group position={[l.pos[0], 0, l.pos[1]]}>
      <mesh geometry={BOX} material={toon(l.color)} position={[0, h / 2, 0]} scale={[w, h, d]} />
      <mesh geometry={BOX} material={toon('#0d0d14')} position={[0, h + 0.25, 0]} scale={[w + 0.6, 0.5, d + 0.6]} />
      <mesh geometry={BOX} material={toon('#07070c')} position={[0, 1.3, faceZ * (d / 2 + 0.03)]} scale={[2.4, 2.6, 0.1]} />
      {/* storefront glass + striped awning */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} geometry={BOX} material={GLASS_MAT} position={[sx * Math.min(w / 2 - 1.8, 3.6), 1.5, faceZ * (d / 2 + 0.05)]} scale={[Math.min(w / 2 - 3, 3.4), 2.2, 0.08]} />
      ))}
      <mesh geometry={BOX} material={toon(l.neon)} position={[0, 3.05, faceZ * (d / 2 + 0.7)]} rotation-x={-faceZ * 0.35} scale={[Math.min(w - 1, 9), 0.12, 1.5]} />
      <mesh geometry={BOX} material={glow(l.neon)} position={[0, signY, faceZ * (d / 2 + 0.12)]} scale={[Math.min(w - 1.5, 8), 0.9, 0.15]} />
      {l.kind === 'tower' && [0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} geometry={BOX} material={glow(i % 2 ? '#fff1b8' : l.neon)}
          position={[((i % 3) - 1) * (w / 3.3), 8 + i * (h - 12) / 6, faceZ * (d / 2 + 0.05)]} scale={[1.4, 0.7, 0.08]} />
      ))}
      <Html position={[0, Math.min(h, 7) + 1.6, faceZ * (d / 2 + 0.4)]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
        <div className="sign" style={{ color: l.neon, textShadow: `0 0 10px ${l.neon}, 0 0 22px ${l.neon}` }}>{l.label}</div>
      </Html>
    </group>
  );
}

function Bridge({ l }: { l: Landmark }) {
  const x = l.pos[0];
  useEffect(() => registerColliders(`bridge${x}`, [boxFromCenter(x, -26, 3, 3), boxFromCenter(x, 26, 3, 3)]), [x]);
  return (<>
    <mesh geometry={BOX} material={toon('#3a3a46')} position={[x, 8, 0]} scale={[10, 1.6, 64]} />
    <mesh geometry={BOX} material={glow('#f59e0b')} position={[x - 5.05, 8, 0]} scale={[0.1, 0.2, 64]} />
    {[-26, 26].map((z) => <mesh key={z} geometry={BOX} material={toon('#2c2c36')} position={[x, 4, z]} scale={[3, 8, 3]} />)}
  </>);
}

/* ------------------------------------------------------ streamed district */
function DistrictContent({ d, routes }: { d: DistrictDef; routes: boolean }) {
  useEffect(() => {
    const boxes: AABB[] = genBuildings(d, routes).map((b) => boxFromCenter(b.x, b.z, 8, 8));
    d.landmarks.forEach((l) => boxes.push(boxFromCenter(l.pos[0], l.pos[1], l.size[0], l.size[2])));
    return registerColliders(`d${d.id}`, boxes);
  }, [d, routes]);
  return (<>
    {d.landmarks.map((l) => <LandmarkView key={l.id} l={l} />)}
    {d.landmarks.filter((l) => l.kind === 'bridge').map((l) => <Bridge key={'b' + l.id} l={l} />)}
    <Props d={d} />
    <Lamps d={d} />
    <Greenery d={d} routes={routes} />
    <ParkedCars d={d} />
    <Crosswalks d={d} />
  </>);
}

/* ---------------------------------------------------------------- barricade */
function Barricade({ d }: { d: DistrictDef }) {
  const x = d.cx - 50;
  useEffect(() => registerColliders(`bar${d.id}`, [boxFromCenter(x, 0, 1.6, 52)]), [x, d.id]);
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={BOX} position={[0, 3, 0]} scale={[0.5, 6, 52]}>
        <meshBasicMaterial color="#ff2d55" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
      {[0.6, 3, 5.4].map((y) => <mesh key={y} geometry={BOX} material={glow(y === 3 ? '#fde047' : '#ff2d55')} position={[0, y, 0]} scale={[0.6, 0.3, 52]} />)}
      <Html position={[0, 4.2, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
        <div className="sign" style={{ color: '#ff5470', fontSize: 15, textAlign: 'center' }}>
          DISTRICT {d.id} LOCKED<br /><span style={{ fontSize: 12, color: '#fde047' }}>pump FAPCOIN to {formatPrice(d.unlockPrice)}</span>
        </div>
      </Html>
    </group>
  );
}


/* ---------------------------------------------------- Level 1 side streets + alleys */
function SideStreets() {
  const { roads, dashes, poles, heads, boxes, crates } = useMemo(() => {
    const roads: { x: number; z: number; w: number; d: number }[] = [];
    const dashes: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [];
    const boxes: AABB[] = [], crates: { x: number; z: number; w: number; h: number; d: number; c: string }[] = [];
    const palette = ['#7a4b24', '#4b5563', '#2f6b4f', '#8a2a2a'];
    ROUTES.forEach((q, qi) => {
      const za = rowZ(q.row, q.dir), end = za + q.dir * 5;
      const zMid = (q.dir * 12 + end) / 2, len = Math.abs(end - q.dir * 12);
      roads.push({ x: q.sx, z: zMid, w: 10, d: len });                                   // side street
      const x0 = Math.min(q.sx, q.ax) - 5, x1 = Math.max(q.sx, q.ax) + 5;
      roads.push({ x: (x0 + x1) / 2, z: za, w: x1 - x0, d: 10 });                         // alley
      for (let z = q.dir * 16; Math.abs(z) < Math.abs(za) - 2; z += q.dir * 5) dashes.push(mat4(q.sx, 0.045, z, 0.22, 0.02, 1.8));
      const ex = Math.sign(q.ax - q.sx);
      for (let x = q.sx + ex * 6; ex * (q.ax - x) > -2; x += ex * 5) dashes.push(mat4(x, 0.045, za, 1.8, 0.02, 0.22));
      // lamps down the side street and alley
      for (let z = q.dir * 20; Math.abs(z) < Math.abs(za); z += q.dir * 14) for (const s of [-1, 1]) {
        poles.push(mat4(q.sx + s * 4.6, 2.4, z, 0.2, 4.8, 0.2)); heads.push(mat4(q.sx + s * 4.2, 4.9, z, 0.7, 0.22, 0.5));
      }
      for (let x = q.sx + ex * 12; ex * (q.ax - x) > 2; x += ex * 14) {
        poles.push(mat4(x, 2.4, za + q.dir * 4.6, 0.2, 4.8, 0.2)); heads.push(mat4(x, 4.9, za + q.dir * 4.2, 0.5, 0.22, 0.7));
      }
      // alley clutter: dumpsters / crates against the walls (solid, keeps the path readable but tight)
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        const onAlley = i % 2 === 0;
        const x = onAlley ? q.sx + (q.ax - q.sx) * (0.25 + 0.6 * t) : q.sx + (i % 4 === 1 ? -3.6 : 3.6);
        const z = onAlley ? za + q.dir * -(((i + qi) % 2) * 2 - 1) * 3.6 : q.dir * (22 + t * (Math.abs(za) - 30));
        const w = onAlley ? 2.6 : 1.5, d = onAlley ? 1.5 : 2.6;
        crates.push({ x, z, w, h: 1.3, d, c: palette[(i + qi) % palette.length] });
        boxes.push(boxFromCenter(x, z, w, d));
      }
    });
    return { roads, dashes, poles, heads, boxes, crates };
  }, []);
  useEffect(() => registerColliders('sidestreets', boxes), [boxes]);
  const asphalt = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b3c43', roughness: 0.92, metalness: 0.02 }), []);
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e4d2', roughness: 0.8 }), []);
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.5, metalness: 0.6 }), []);
  return (<>
    {roads.map((r, i) => (
      <mesh key={i} rotation-x={-Math.PI / 2} position={[r.x, 0.022, r.z]} material={asphalt}><planeGeometry args={[r.w, r.d]} /></mesh>
    ))}
    <Instances geometry={BOX} material={paint} matrices={dashes} />
    <Instances geometry={BOX} material={poleMat} matrices={poles} />
    <Instances geometry={BOX} material={glow('#ffe2a8')} matrices={heads} />
    {crates.map((c, i) => <mesh key={i} geometry={BOX} material={toon(c.c)} position={[c.x, c.h / 2, c.z]} scale={[c.w, c.h, c.d]} castShadow receiveShadow />)}
  </>);
}

/* ---------------------------------------------- greenery, parked cars, crosswalks */
const inLandmark = (d: DistrictDef, x: number, z: number, pad = 1.5) =>
  d.landmarks.some((l) => Math.sign(l.pos[1]) === Math.sign(z) && Math.abs(x - l.pos[0]) < l.size[0] / 2 + pad);

/** true where a Level 1 side street / alley mouth opens onto the main street — keep trees and bushes out of it */
const inSideStreetMouth = (x: number, z: number, pad = 0) =>
  ROUTES.some((q) => Math.sign(z) === q.dir && Math.abs(x - q.sx) < 7 + pad);

function Greenery({ d, routes }: { d: DistrictDef; routes: boolean }) {
  const { palms, trees, bushes, boxes } = useMemo(() => {
    const r = rng(d.id * 555 + 9), dens = QUALITY_INFO[getQuality()].trees;
    const palms: THREE.Matrix4[] = [], trees: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [], boxes: AABB[] = [];
    const palmy = d.style === 'london' || d.style === 'finance' ? 0.45 : 0.7;
    for (let i = 0; i < 15; i++) for (const side of [-1, 1]) {
      const x = d.cx - 46 + i * 6.6 + (r() - 0.5) * 2.4, z = side * (12.9 + r() * 1.3), pick = r(), s = 0.85 + r() * 0.4, ry = r() * 6.28;
      if (r() > dens || inLandmark(d, x, z, 2.5) || (routes && inSideStreetMouth(x, z))) continue;
      if (pick < palmy) palms.push(mat4(x, 0, z, s, s, s, ry)); else trees.push(mat4(x, 0, z, s, s, s, ry));
      boxes.push(boxFromCenter(x, z, 0.7, 0.7));
      if (r() < 0.6) { const bx = x + (r() - 0.5) * 4, bz = side * (11.6 + r() * 1.2), bs = 0.8 + r() * 0.6; if (!inLandmark(d, bx, bz, 0.8) && !(routes && inSideStreetMouth(bx, bz))) bushes.push(mat4(bx, 0, bz, bs, bs, bs, r() * 6)); }
    }
    return { palms, trees, bushes, boxes };
  }, [d, routes]);
  useEffect(() => registerColliders(`trees${d.id}`, boxes), [boxes, d.id]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), []);
  return (<>
    <Instances geometry={getPalmGeo()} material={mat} matrices={palms} cast />
    <Instances geometry={getTreeGeo()} material={mat} matrices={trees} cast />
    <Instances geometry={getBushGeo()} material={mat} matrices={bushes} cast />
  </>);
}

const CAR_COLORS = ['#b3261e', '#23313f', '#e8e9ea', '#e4b422', '#7a8088', '#1f8a70', '#2467a8', '#17181b', '#c8c9cc', '#6d3b8c'];
const BUS_SPOTS: [number, number][] = [[-18, 6.4], [10, -6.4], [38, 6.4]];
function ParkedCars({ d }: { d: DistrictDef }) {
  const { m, c, boxes } = useMemo(() => {
    const r = rng(d.id * 303 + 17);
    const m: THREE.Matrix4[] = [], c: THREE.Color[] = [], boxes: AABB[] = [];
    const keep: [number, number][] = [[LAPTOP_POS[0], LAPTOP_POS[2]]];
    RECRUIT_QUESTS.forEach((q) => { keep.push([q.npcPos[0], q.npcPos[2]]); q.orbs.forEach((o) => keep.push([o[0], o[1]])); });
    for (let i = 0; i < 10; i++) {
      const side = r() < 0.5 ? -1 : 1, x = d.cx - 44 + i * 9.6 + (r() - 0.5) * 3, z = side * 6.85, col = CAR_COLORS[Math.floor(r() * CAR_COLORS.length)];
      if (r() < 0.25) continue;
      if (d.style === 'market' && BUS_SPOTS.some(([bx, bz]) => Math.sign(bz) === side && Math.abs(x - (d.cx + bx)) < 7.5)) continue;
      if (keep.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < 6.5)) continue;
      m.push(mat4(x, 0, z, 1, 1, 1, side > 0 ? Math.PI / 2 : -Math.PI / 2)); c.push(new THREE.Color(col));
      boxes.push(boxFromCenter(x, z, 4.5, 1.95));
    }
    return { m, c, boxes };
  }, [d]);
  useEffect(() => registerColliders(`cars${d.id}`, boxes), [boxes, d.id]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.3, metalness: 0.55, envMapIntensity: 1.3 }), []);
  return <Instances geometry={getCarGeo()} material={mat} matrices={m} colors={c} cast />;
}

function TrafficLight({ x, side }: { x: number; side: number }) {
  return (
    <group position={[x, 0, side * 9.3]}>
      <mesh geometry={BOX} material={toon('#2f3138')} position={[0, 2.6, 0]} scale={[0.18, 5.2, 0.18]} />
      <mesh geometry={BOX} material={toon('#2f3138')} position={[0, 5.0, -side * 1.2]} scale={[0.14, 0.14, 2.5]} />
      <mesh geometry={BOX} material={toon('#15161a')} position={[0, 4.55, -side * 2.3]} scale={[0.45, 1.35, 0.5]} />
      {[-1, 1].map((f) => (<group key={f}>
        <mesh geometry={BOX} material={toon('#3a1414')} position={[f * 0.26, 4.98, -side * 2.3]} scale={[0.05, 0.26, 0.26]} />
        <mesh geometry={BOX} material={toon('#3a3414')} position={[f * 0.26, 4.55, -side * 2.3]} scale={[0.05, 0.26, 0.26]} />
        <mesh geometry={BOX} material={glow('#38ff7a')} position={[f * 0.26, 4.12, -side * 2.3]} scale={[0.05, 0.26, 0.26]} />
      </group>))}
    </group>
  );
}

function Crosswalks({ d }: { d: DistrictDef }) {
  const tex = useMemo(() => crosswalkTexture(), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), [tex]);
  const xs = [d.cx - 31, d.cx + 31];
  return (<>
    {xs.map((x) => (
      <group key={x}>
        <mesh rotation-x={-Math.PI / 2} position={[x, 0.034, 0]} material={mat}><planeGeometry args={[3.6, 14.6]} /></mesh>
        <TrafficLight x={x + 2.6} side={1} />
        <TrafficLight x={x - 2.6} side={-1} />
      </group>
    ))}
  </>);
}

/* ---------------------------------------------------------------------- city */
export default function City({ openAll = false, routes = false }: { openAll?: boolean; routes?: boolean }) {
  const storePeak = useGame((s) => s.peakPrice);
  const peak = openAll ? 1e12 : storePeak;
  const [near, setNear] = useState<number[]>([1]);
  const prevUnlocked = useRef<number>(1);

  // district streaming: only mount districts that are unlocked AND within ~130m
  useEffect(() => {
    const id = setInterval(() => {
      const x = playerState.pos.x;
      const n = DISTRICTS.filter((d) => Math.abs(x - d.cx) < 130).map((d) => d.id);
      setNear((p) => (p.length === n.length && p.every((v, i) => v === n[i]) ? p : n));
    }, 400);
    return () => clearInterval(id);
  }, []);

  // announce unlocks
  useEffect(() => {
    const unlocked = DISTRICTS.filter((d) => isDistrictUnlocked(d.id, peak)).length;
    if (unlocked > prevUnlocked.current) {
      const d = DISTRICTS[unlocked - 1];
      useGame.getState().toast(`DISTRICT ${d.id} UNLOCKED — ${d.name}`, 'good');
      haptic.notify('success');
    }
    prevUnlocked.current = unlocked;
  }, [peak]);

  // world boundary
  useEffect(() => openAll ? undefined : registerColliders('world', [
    { minX: WORLD.minX - 2, maxX: WORLD.minX, minZ: -WORLD.halfZ, maxZ: WORLD.halfZ },
    { minX: WORLD.maxX, maxX: WORLD.maxX + 2, minZ: -WORLD.halfZ, maxZ: WORLD.halfZ },
    { minX: WORLD.minX, maxX: WORLD.maxX, minZ: WORLD.halfZ, maxZ: WORLD.halfZ + 2 },
    { minX: WORLD.minX, maxX: WORLD.maxX, minZ: -WORLD.halfZ - 2, maxZ: -WORLD.halfZ },
  ]), [openAll]);

  const { road, paving, grass, curbMat } = useMemo(() => {
    const W = WORLD.maxX - WORLD.minX;
    const road = cityRoadTexture().clone(); road.repeat.set(W / 14, 1); road.needsUpdate = true;
    const paving = pavingTexture().clone(); paving.repeat.set((W + 40) / 4, (WORLD.halfZ * 2 + 30) / 4); paving.needsUpdate = true;
    const grass = grassTexture().clone(); grass.repeat.set(W / 5, 3.2 / 5); grass.needsUpdate = true;
    const curbMat = new THREE.MeshStandardMaterial({ color: '#b8b5ac', roughness: 0.9 });
    return { road, paving, grass, curbMat };
  }, []);
  const walkMat = useMemo(() => {
    const t = pavingTexture().clone(); t.repeat.set((WORLD.maxX - WORLD.minX) / 4, 0.8); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
  }, []);

  const w = WORLD.maxX - WORLD.minX;
  const cxm = (WORLD.maxX + WORLD.minX) / 2;

  return (
    <group>
      {/* ground, road (worn asphalt + lane paint), curbs, sidewalks, grass verges */}
      <mesh rotation-x={-Math.PI / 2} position={[cxm, 0, 0]}>
        <planeGeometry args={[w + 40, WORLD.halfZ * 2 + 30]} />
        <meshStandardMaterial map={paving} roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={'g' + s} rotation-x={-Math.PI / 2} position={[cxm, 0.012, s * 13]}>
          <planeGeometry args={[w, 3.2]} />
          <meshStandardMaterial map={grass} roughness={1} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[cxm, 0.02, 0]}>
        <planeGeometry args={[w, 16]} />
        <meshStandardMaterial map={road} roughness={0.88} metalness={0.02} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={BOX} material={curbMat} position={[cxm, 0.09, s * 8.12]} scale={[w, 0.18, 0.28]} />
          <mesh geometry={BOX} material={walkMat} position={[cxm, 0.08, s * 9.6]} scale={[w, 0.16, 3.0]} />
        </group>
      ))}
      {openAll && <OuterCity />}
      <Buildings routes={routes} />
      {routes && <SideStreets />}
      <Graffiti routes={routes} />
      {DISTRICTS.filter((d) => near.includes(d.id) && isDistrictUnlocked(d.id, peak)).map((d) => <DistrictContent key={d.id} d={d} routes={routes} />)}
      {DISTRICTS.filter((d) => d.id > 1 && !isDistrictUnlocked(d.id, peak)).map((d) => <Barricade key={d.id} d={d} />)}
    </group>
  );
}
