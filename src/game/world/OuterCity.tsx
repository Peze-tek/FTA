'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { onRoad, WORLD, WORLD_FULL, ISLAND, PLAZAS, AVENUES_Z, CROSS_X, RING_X, PARK } from '@/game/data/districts';
import Island from '@/game/world/Island';
import CityDetail from '@/game/world/CityDetail';
import { rng } from '@/lib/rng';
import { registerColliders, boxFromCenter, type AABB } from '@/lib/colliders';
import { BOX, toon, glow } from '@/game/materials';
import { cityRoadTexture, grassTexture, pavingTexture } from '@/lib/textures';
import { getBushGeo, getCarGeo, getPalmGeo, getTreeGeo } from '@/game/world/foliage';
import { Instances, facadeMaterials, mat4, BUILDING_H } from '@/game/world/City';

/**
 * The rest of the city: ring road, two more avenues each side of downtown, cross streets, filled city
 * blocks, a central park with a pond, street trees / lamps / parked cars. Only mounted in the open modes.
 */
const F = WORLD_FULL;
const TINTS = ['#ffffff', '#f2e6d6', '#dde6f0', '#e8dcee', '#d6e8de', '#f0dcd0', '#cfe0f0'];
const CAR_COLORS = ['#b3261e', '#23313f', '#e8e9ea', '#e4b422', '#7a8088', '#1f8a70', '#2467a8', '#17181b', '#c8c9cc', '#6d3b8c'];

interface B { x: number; z: number; cls: number; tint: string }

/** North/south city blocks between the avenues, plus west/east extensions beside the main street. */
function genOuter(): B[] {
  const r = rng(424242);
  const out: B[] = [];
  const pick = (downtown: number) => {
    // downtown (0..1) pushes the skyline taller toward the centre of the map
    const w = [0.34 - downtown * 0.2, 0.34, 0.22 + downtown * 0.08, 0.1 + downtown * 0.12];
    let roll = r() * (w[0] + w[1] + w[2] + w[3]), cls = 0;
    for (let i = 0; i < 4; i++) { roll -= w[i]; if (roll <= 0) { cls = i; break; } cls = i; }
    return cls;
  };
  const add = (x: number, z: number) => {
    const dt = Math.max(0, 1 - Math.hypot(x - 150, z * 0.6) / 230);
    if (PLAZAS.some(([px, pz]) => Math.abs(x - px) < 15 && Math.abs(z - pz) < 15)) return;
    out.push({ x: x + (r() - 0.5) * 0.5, z, cls: pick(dt), tint: TINTS[Math.floor(r() * TINTS.length)] });
  };
  const nearCross = (x: number) => CROSS_X.some((c) => Math.abs(x - c) < 9);
  const rowsA = [115, 125, 135], rowsB = [165, 175, 185, 195];
  for (let x = RING_X[0] + 12; x <= RING_X[1] - 12; x += 10) {
    if (nearCross(x)) continue;
    for (const s of [-1, 1]) {
      for (const z of rowsA) if (r() > 0.03) add(x, s * z);
      const park = x > PARK.minX && x < PARK.maxX;
      if (!park) for (const z of rowsB) if (r() > 0.03) add(x, s * z);
    }
  }
  // west & east extensions (beside the original districts)
  const ext: number[] = [];
  for (let x = RING_X[0] + 12; x < WORLD.minX - 6; x += 10) ext.push(x);
  for (let x = WORLD.maxX + 8; x <= RING_X[1] - 12; x += 10) ext.push(x);
  for (const x of ext) for (const s of [-1, 1]) for (let row = 0; row < 7; row++) if (r() > 0.03) add(x, s * (28 + row * 10));
  return out;
}

function Road({ x, z, w, d, tex, y = 0.02 }: { x: number; z: number; w: number; d: number; tex: THREE.Texture; y?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, y, z]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} roughness={0.88} metalness={0.02} />
    </mesh>
  );
}

export default function OuterCity() {
  const { blds, boxes, roadE, roadN, walkMat, curbMat, grass, treeMat, trees, palms, bushes, cars, lampM, headM, treeBoxes } = useMemo(() => {
    const blds = genOuter();
    const boxes: AABB[] = blds.map((b) => boxFromCenter(b.x, b.z, 8, 8));
    const W = F.maxX - F.minX;
    const roadE = cityRoadTexture().clone(); roadE.repeat.set(W / 14, 1); roadE.needsUpdate = true;
    const roadN = cityRoadTexture().clone(); roadN.repeat.set((F.halfZ * 2) / 14, 1); roadN.needsUpdate = true;
    const pave = pavingTexture().clone(); pave.repeat.set(W / 4, 0.8); pave.needsUpdate = true;
    const walkMat = new THREE.MeshStandardMaterial({ map: pave, roughness: 0.92 });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#b8b5ac', roughness: 0.9 });
    const grass = grassTexture().clone(); grass.repeat.set((PARK.maxX - PARK.minX) / 5, 8); grass.needsUpdate = true;
    const treeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });

    const r = rng(777);
    const trees: THREE.Matrix4[] = [], palms: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [], treeBoxes: AABB[] = [];
    const lampM: THREE.Matrix4[] = [], headM: THREE.Matrix4[] = [], cars: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const onCross = (x: number) => CROSS_X.some((c) => Math.abs(x - c) < 9);
    // street trees, lamps and parked cars along every avenue
    for (const az of AVENUES_Z) for (const s of [-1, 1]) {
      const zz = az + s * 10.6;                       // sidewalk centre line
      for (let x = F.minX + 8; x < F.maxX - 8; x += 13) {
        if (onCross(x) || (Math.abs(az) < 120 && x > WORLD.minX - 4 && x < WORLD.maxX + 4)) continue;
        const px = x + (r() - 0.5) * 3, sc = 0.85 + r() * 0.35;
        if (onRoad(px, zz, 1.4)) continue;
        if (r() < 0.55) {
          (r() < 0.5 ? palms : trees).push(mat4(px, 0, zz, sc, sc, sc, r() * 6.28));
          treeBoxes.push(boxFromCenter(px, zz, 0.7, 0.7));
        } else if (r() < 0.6) bushes.push(mat4(px, 0, zz - s * 0.8, 1, 1, 1, r() * 6));
        if (r() < 0.5) {
          const cx = x + 5 + r() * 4, cz = az + s * 5.4;
          cars.push({ m: mat4(cx, 0, cz, 1, 1, 1, Math.PI / 2 * (s > 0 ? 1 : -1)), c: new THREE.Color(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]) });
          treeBoxes.push(boxFromCenter(cx, cz, 4.4, 1.9));
        }
      }
      for (let x = F.minX + 20; x < F.maxX - 20; x += 18) {
        if (onCross(x) || (Math.abs(az) < 120 && x > WORLD.minX - 4 && x < WORLD.maxX + 4)) continue;
        lampM.push(mat4(x, 3.2, az + s * 8.9, 0.14, 6.4, 0.14));
        headM.push(mat4(x, 6.5, az + s * 8.9, 0.8, 0.22, 0.8));
      }
    }
    // park: dense trees around the pond
    const pz = [-1, 1];
    for (const s of pz) for (let i = 0; i < 70; i++) {
      const x = PARK.minX + 3 + r() * (PARK.maxX - PARK.minX - 6), z = s * (PARK.z0 + 2 + r() * (PARK.z1 - PARK.z0 - 4));
      if (Math.hypot(x - (PARK.minX + PARK.maxX) / 2, z - s * (PARK.z0 + PARK.z1) / 2) < 12) continue;   // keep the pond clear
      const sc = 0.9 + r() * 0.5;
      (r() < 0.25 ? palms : trees).push(mat4(x, 0, z, sc, sc, sc, r() * 6.28));
      treeBoxes.push(boxFromCenter(x, z, 0.7, 0.7));
      if (r() < 0.6) bushes.push(mat4(x + (r() - 0.5) * 4, 0, z + (r() - 0.5) * 4, 1, 1, 1, r() * 6));
    }
    return { blds, boxes, roadE, roadN, walkMat, curbMat, grass, treeMat, trees, palms, bushes, cars, lampM, headM, treeBoxes };
  }, []);

  useEffect(() => registerColliders('outer', [...boxes, ...treeBoxes]), [boxes, treeBoxes]);
  useEffect(() => registerColliders('world-full', [
    { minX: ISLAND.minX - 2, maxX: ISLAND.minX, minZ: -ISLAND.halfZ, maxZ: ISLAND.halfZ },
    { minX: ISLAND.maxX, maxX: ISLAND.maxX + 2, minZ: -ISLAND.halfZ, maxZ: ISLAND.halfZ },
    { minX: ISLAND.minX, maxX: ISLAND.maxX, minZ: ISLAND.halfZ, maxZ: ISLAND.halfZ + 2 },
    { minX: ISLAND.minX, maxX: ISLAND.maxX, minZ: -ISLAND.halfZ - 2, maxZ: -ISLAND.halfZ },
  ]), []);

  const { geos, mats } = useMemo(() => facadeMaterials(), []);
  const per = useMemo(() => {
    const p: { m: THREE.Matrix4[]; c: THREE.Color[] }[] = BUILDING_H.map(() => ({ m: [], c: [] }));
    blds.forEach((b) => { p[b.cls].m.push(mat4(b.x, BUILDING_H[b.cls] / 2, b.z, 1, 1, 1)); p[b.cls].c.push(new THREE.Color(b.tint)); });
    return p;
  }, [blds]);
  const carGeo = useMemo(() => getCarGeo(), []);
  const carMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.15 }), []);
  const lampMat = useMemo(() => toon('#3a3a44'), []);
  const headMat = useMemo(() => glow('#ffd9a0'), []);

  const W = F.maxX - F.minX, cx = (F.minX + F.maxX) / 2, H = F.halfZ * 2;
  const pondX = (PARK.minX + PARK.maxX) / 2;

  return (
    <group>
      <Island />
      <CityDetail blds={blds} />
      {/* ground for the whole city */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.01, 0]}>
        <planeGeometry args={[W + 60, H + 60]} />
        <meshStandardMaterial map={useMemo(() => { const t = pavingTexture().clone(); t.repeat.set((W + 60) / 4, (H + 60) / 4); t.needsUpdate = true; return t; }, [W, H])} roughness={0.95} />
      </mesh>

      {/* main street carried out to both ends of the map */}
      {[[F.minX, WORLD.minX], [WORLD.maxX, F.maxX]].map(([a, b], i) => (
        <group key={'ms' + i}>
          <Road x={(a + b) / 2} z={0} w={b - a} d={16} tex={roadE} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={BOX} material={curbMat} position={[(a + b) / 2, 0.09, s * 8.12]} scale={[b - a, 0.18, 0.28]} />
              <mesh geometry={BOX} material={walkMat} position={[(a + b) / 2, 0.08, s * 9.6]} scale={[b - a, 0.16, 3.0]} />
            </group>
          ))}
        </group>
      ))}

      {/* avenues */}
      {AVENUES_Z.map((az) => (
        <group key={az}>
          <Road x={cx} z={az} w={W} d={14} tex={roadE} />
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh geometry={BOX} material={curbMat} position={[cx, 0.09, az + s * 7.12]} scale={[W, 0.18, 0.28]} />
              <mesh geometry={BOX} material={walkMat} position={[cx, 0.08, az + s * 8.9]} scale={[W, 0.16, 3.2]} />
            </group>
          ))}
        </group>
      ))}

      {/* cross streets + ring roads (north-south) */}
      {[...RING_X, ...CROSS_X].map((rx) => {
        const ring = RING_X.includes(rx);
        const a = ring ? -F.halfZ : 93, len = ring ? F.halfZ * 2 : F.halfZ - 93;
        return (
          <group key={rx}>
            {(ring ? [0] : [-1, 1]).map((s) => {
              const zc = ring ? 0 : s * (93 + len / 2);
              return (
                <group key={s} position={[rx, 0, zc]} rotation-y={Math.PI / 2}>
                  <Road x={0} z={0} w={ring ? len : len} d={ring ? 14 : 12} tex={roadN} y={0.022} />
                  {[-1, 1].map((q) => (
                    <group key={q}>
                      <mesh geometry={BOX} material={curbMat} position={[0, 0.09, q * (ring ? 7.12 : 6.12)]} scale={[len, 0.18, 0.28]} />
                      <mesh geometry={BOX} material={walkMat} position={[0, 0.08, q * (ring ? 8.9 : 7.9)]} scale={[len, 0.16, 3.2]} />
                    </group>
                  ))}
                </group>
              );
            })}
            {void a}
          </group>
        );
      })}

      {/* city blocks */}
      {per.map((p, i) => <Instances key={i} geometry={geos[i]} material={mats[i]} matrices={p.m} colors={p.c} />)}

      {/* park + pond (north & south) */}
      {[-1, 1].map((s) => {
        const zc = s * (PARK.z0 + PARK.z1) / 2;
        return (
          <group key={s}>
            <mesh rotation-x={-Math.PI / 2} position={[pondX, 0.013, zc]}>
              <planeGeometry args={[PARK.maxX - PARK.minX, PARK.z1 - PARK.z0]} />
              <meshStandardMaterial map={grass} roughness={1} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[pondX, 0.03, zc]}>
              <circleGeometry args={[10, 32]} />
              <meshStandardMaterial color="#2a7fb8" roughness={0.15} metalness={0.4} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[pondX, 0.025, zc]}>
              <ringGeometry args={[10, 11.4, 32]} />
              <meshStandardMaterial color="#b8b5ac" roughness={0.9} />
            </mesh>
          </group>
        );
      })}
      <Instances geometry={getPalmGeo()} material={treeMat} matrices={palms} cast />
      <Instances geometry={getTreeGeo()} material={treeMat} matrices={trees} cast />
      <Instances geometry={getBushGeo()} material={treeMat} matrices={bushes} />

      {/* lamps + parked cars */}
      <Instances geometry={BOX} material={lampMat} matrices={lampM} />
      <Instances geometry={BOX} material={headMat} matrices={headM} />
      <Instances geometry={carGeo} material={carMat} matrices={cars.map((c) => c.m)} colors={cars.map((c) => c.c)} />
    </group>
  );
}
