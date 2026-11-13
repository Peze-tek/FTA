'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { onRoad, WORLD, WORLD_FULL as F, AVENUES_Z, CROSS_X, RING_X, PARK, PLAZAS } from '@/game/data/districts';
import { rng } from '@/lib/rng';
import { registerColliders, boxFromCenter, type AABB } from '@/lib/colliders';
import { BOX } from '@/game/materials';
import { grassTexture } from '@/lib/textures';
import { cullRadius, Instances, mat4 } from '@/game/world/City';
import { getBushGeo, getPalmGeo, getTreeGeo } from '@/game/world/foliage';

/** Everything that stops the outer city feeling empty: street furniture, neon shop signs, verges, plazas with fountains, pocket parks. */
export default function CityDetail({ blds }: { blds: { x: number; z: number; cls: number }[] }) {
  const d = useMemo(() => {
    const r = rng(31337);
    const onCross = (x: number) => CROSS_X.some((c) => Math.abs(x - c) < 9);
    const inCore = (x: number, az: number) => Math.abs(az) < 120 && x > WORLD.minX - 4 && x < WORLD.maxX + 4;
    const P = () => ({ m: [] as THREE.Matrix4[], c: [] as THREE.Color[] });
    const bench = P(), bin = P(), hyd = P(), shelter = P(), glass = P(), sign = P(), fnt = P(), water = P(), stone = P();
    const trees: THREE.Matrix4[] = [], palms: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [], boxes: AABB[] = [];
    const col = (hex: string) => new THREE.Color(hex);
    const NEON = ['#ff2d55', '#22d3ee', '#ffd23f', '#39ff88', '#ff4fd8', '#ff8a1f', '#7c8cff'];
    const plant = (x: number, z: number, big = r() < 0.5) => {
      if (onRoad(x, z, 1.4)) return;
      const sc = 0.85 + r() * 0.45;
      (big ? trees : palms).push(mat4(x, 0, z, sc, sc, sc, r() * 6.28)); boxes.push(boxFromCenter(x, z, 0.7, 0.7));
    };

    // sidewalk furniture along every avenue and the main-street extensions
    const line = (az: number, x0: number, x1: number) => {
      for (const s of [-1, 1]) for (let x = x0; x < x1; x += 9) {
        if (onCross(x) || r() < 0.28) continue;
        const px = x + r() * 4, zs = az + s * 9.4, pick = r(), face = s > 0 ? Math.PI : 0;
        if (pick < 0.3) {                    // bench
          bench.m.push(mat4(px, 0.45, zs + s * 0.9, 1.6, 0.12, 0.5, 0), mat4(px, 0.8, zs + s * 1.15, 1.6, 0.55, 0.1, 0)); bench.c.push(col('#8b5a2b'), col('#6b3f1d'));
        } else if (pick < 0.55) { bin.m.push(mat4(px, 0.45, zs + s * 1.1, 0.5, 0.9, 0.5)); bin.c.push(col(r() < 0.5 ? '#2f6f4f' : '#44464e')); }
        else if (pick < 0.7) { hyd.m.push(mat4(px, 0.35, zs - s * 0.6, 0.3, 0.7, 0.3)); hyd.c.push(col('#d62828')); }
        else if (pick < 0.8 && !inCore(px, az)) {   // bus shelter
          shelter.m.push(mat4(px, 2.45, zs + s * 0.6, 3.2, 0.12, 1.5), mat4(px - 1.4, 1.2, zs + s * 0.6, 0.1, 2.4, 0.1), mat4(px + 1.4, 1.2, zs + s * 0.6, 0.1, 2.4, 0.1));
          shelter.c.push(col('#3a3d46'), col('#3a3d46'), col('#3a3d46'));
          glass.m.push(mat4(px, 1.2, zs + s * 1.28, 2.8, 2.2, 0.05)); glass.c.push(col('#7fc8e8'));
          boxes.push(boxFromCenter(px, zs + s * 0.8, 3.2, 1.6));
        } else plant(px, zs - s * 0.2);
      }
    };
    for (const az of AVENUES_Z) line(az, F.minX + 14, F.maxX - 14);
    line(0, F.minX + 14, WORLD.minX - 6); line(0, WORLD.maxX + 6, F.maxX - 14);

    // neon shop signs on the street-facing wall of roughly every third building
    for (const b of blds) {
      if (r() > 0.34) continue;
      const az = AVENUES_Z.concat([0]).reduce((a, c) => (Math.abs(c - b.z) < Math.abs(a - b.z) ? c : a));
      const sgn = Math.sign(az - b.z) || 1;
      sign.m.push(mat4(b.x + (r() - 0.5) * 2, 3 + r() * 2.5, b.z + sgn * 4.07, 3 + r() * 2, 0.7 + r() * 0.5, 0.12)); sign.c.push(col(NEON[Math.floor(r() * NEON.length)]));
    }

    // verge between the original districts and the first avenues (was bare paving)
    for (const s of [-1, 1]) for (let x = WORLD.minX + 4; x < WORLD.maxX - 3; x += 7) {
      if (onCross(x)) continue;
      plant(x + r() * 2, s * (88.4 + r() * 0.8), r() < 0.45);
      if (r() < 0.7) bushes.push(mat4(x + 3 + r() * 2, 0, s * (86 + r() * 1.5), 1.1, 1.1, 1.1, r() * 6));
    }
    // west / east pocket parks beside the main street (was empty)
    const pocket = (x0: number, x1: number) => {
      for (const s of [-1, 1]) for (let i = 0; i < 26; i++) {
        const x = x0 + 3 + r() * (x1 - x0 - 6), z = s * (13 + r() * 9);
        plant(x, z, r() < 0.55);
        if (r() < 0.6) bushes.push(mat4(x + (r() - 0.5) * 3, 0, z + (r() - 0.5) * 3, 1, 1, 1, r() * 6));
      }
    };
    pocket(RING_X[0] + 10, WORLD.minX - 4); pocket(WORLD.maxX + 4, RING_X[1] - 10);
    // promenade palms along the sea-side edge of the city
    for (let z = -F.halfZ + 8; z < F.halfZ - 6; z += 8) { plant(F.minX + 3, z + r() * 2, false); plant(F.maxX - 3, z + r() * 2, false); }
    for (let x = F.minX + 8; x < F.maxX - 6; x += 8) { plant(x + r() * 2, -F.halfZ + 3, false); plant(x + r() * 2, F.halfZ - 3, false); }
    // hedges + trees along the back of the outer blocks (z 199..204)
    for (const s of [-1, 1]) for (let x = F.minX + 10; x < F.maxX - 8; x += 6) {
      if (onCross(x) || (x > PARK.minX - 2 && x < PARK.maxX + 2)) continue;
      if (r() < 0.5) bushes.push(mat4(x, 0, s * (201 + r() * 2.2), 1.3, 1.1, 1.3, r() * 6));
      if (r() < 0.25) plant(x + 2, s * 202.5);
    }
    // plazas with fountains (the buildings were left out of these spots)
    for (const [px, pz] of PLAZAS) {
      stone.m.push(mat4(px, 0.04, pz, 24, 0.08, 24)); stone.c.push(col('#d9d3c4'));
      fnt.m.push(mat4(px, 0.35, pz, 7, 0.7, 7), mat4(px, 1.1, pz, 0.9, 2.2, 0.9)); fnt.c.push(col('#c9c4b6'), col('#c9c4b6'));
      water.m.push(mat4(px, 0.55, pz, 6.2, 0.05, 6.2)); water.c.push(col('#3aa7d6'));
      boxes.push(boxFromCenter(px, pz, 7, 7));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28, rr = 10.5; plant(px + Math.cos(a) * rr, pz + Math.sin(a) * rr, k % 2 === 0); }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.78; bench.m.push(mat4(px + Math.cos(a) * 8.6, 0.45, pz + Math.sin(a) * 8.6, 1.6, 0.12, 0.5, -a + 1.57)); bench.c.push(col('#8b5a2b')); }
    }
    const keep = (ms: THREE.Matrix4[]) => ms.filter((q) => !onRoad(q.elements[12], q.elements[14], 0.6));
    const keepP = (p: { m: THREE.Matrix4[]; c: THREE.Color[] }) => { const m: THREE.Matrix4[] = [], c: THREE.Color[] = []; p.m.forEach((q, i) => { if (!onRoad(q.elements[12], q.elements[14], 0.6)) { m.push(q); c.push(p.c[i]); } }); return { m, c }; };
    return { bench: keepP(bench), bin: keepP(bin), hyd: keepP(hyd), shelter, glass, sign, fnt, water, stone, trees, palms, bushes: keep(bushes), boxes };
  }, [blds]);
  useEffect(() => registerColliders('detail', d.boxes), [d]);

  const m = useMemo(() => ({
    std: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.4 }),
    water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.3, emissive: '#1c6c94', emissiveIntensity: 0.4 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  }), []);
  const verge = useMemo(() => { const t = grassTexture().clone(); t.repeat.set((WORLD.maxX - WORLD.minX) / 5, 1); t.needsUpdate = true; return t; }, []);
  const pocketTex = useMemo(() => { const t = grassTexture().clone(); t.repeat.set(8, 3); t.needsUpdate = true; return t; }, []);
  const I = (p: { m: THREE.Matrix4[]; c: THREE.Color[] }, mat: THREE.Material, g: THREE.BufferGeometry = BOX) => <Instances cull={cullRadius()} geometry={g} material={mat} matrices={p.m} colors={p.c} />;
  const cyl = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 20), []);
  return (
    <group>
      {[-1, 1].map((s) => <mesh key={'v' + s} rotation-x={-Math.PI / 2} position={[(WORLD.minX + WORLD.maxX) / 2, 0.011, s * 88.5]}><planeGeometry args={[WORLD.maxX - WORLD.minX, 5]} /><meshStandardMaterial map={verge} roughness={1} /></mesh>)}
      {[[RING_X[0] + 10, WORLD.minX - 4], [WORLD.maxX + 4, RING_X[1] - 10]].flatMap(([a, b]) => [-1, 1].map((s) => (
        <mesh key={`p${a}${s}`} rotation-x={-Math.PI / 2} position={[(a + b) / 2, 0.011, s * 17.5]}><planeGeometry args={[b - a, 12]} /><meshStandardMaterial map={pocketTex} roughness={1} /></mesh>
      )))}
      {I(d.bench, m.std)}{I(d.bin, m.std)}{I(d.hyd, m.std)}{I(d.shelter, m.std)}{I(d.glass, m.glass)}
      {I(d.sign, m.glow)}
      {I(d.stone, m.std)}
      {I(d.fnt, m.std, cyl)}{I(d.water, m.water, cyl)}
      <Instances cull={cullRadius()} geometry={getTreeGeo()} material={m.leaf} matrices={d.trees} cast />
      <Instances cull={cullRadius()} geometry={getPalmGeo()} material={m.leaf} matrices={d.palms} cast />
      <Instances cull={cullRadius()} geometry={getBushGeo()} material={m.leaf} matrices={d.bushes} />
    </group>
  );
}
