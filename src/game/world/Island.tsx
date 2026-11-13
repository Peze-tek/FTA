'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND, BEACH } from '@/game/data/districts';
import { rng } from '@/lib/rng';
import { registerColliders, boxFromCenter, type AABB } from '@/lib/colliders';
import { BOX, glow } from '@/game/materials';
import { Instances, mat4 } from '@/game/world/City';
import { getPalmGeo, getBushGeo } from '@/game/world/foliage';

/** Beach, sea and shoreline dressing around the edge of the open-mode city. */
const cx = (ISLAND.minX + ISLAND.maxX) / 2, W = ISLAND.maxX - ISLAND.minX, D = ISLAND.halfZ * 2;

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const sandTex = (rep: [number, number]) => canvasTex(256, 256, (x) => {
  const r = rng(91); x.fillStyle = '#e6cf9a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = r(); x.fillStyle = v < 0.5 ? 'rgba(180,150,95,.28)' : 'rgba(255,245,215,.3)'; x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 1.5); }
  for (let i = 0; i < 14; i++) { x.strokeStyle = 'rgba(170,140,90,.16)'; x.lineWidth = 2; x.beginPath(); const y = r() * 256; x.moveTo(0, y); x.bezierCurveTo(80, y + 8, 170, y - 8, 256, y); x.stroke(); }
}, rep);
const waterTex = (rep: number, a: string, b: string) => canvasTex(256, 256, (x) => {
  const r = rng(rep * 7); x.fillStyle = a; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 170; i++) { x.strokeStyle = b; x.globalAlpha = 0.1 + r() * 0.3; x.lineWidth = 1 + r() * 2.2; const px = r() * 256, py = r() * 256, l = 14 + r() * 36; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + l / 2, py - 4 - r() * 4, px + l, py); x.stroke(); }
}, [rep, rep]);

/** The four shores. local l = along the edge, o = outward (negative = onto the beach). */
const SIDES = [
  { id: 'S', ex: cx, ez: ISLAND.halfZ, tx: 1, tz: 0, nx: 0, nz: 1, len: W, ry: 0 },
  { id: 'N', ex: cx, ez: -ISLAND.halfZ, tx: -1, tz: 0, nx: 0, nz: -1, len: W, ry: Math.PI },
  { id: 'E', ex: ISLAND.maxX, ez: 0, tx: 0, tz: -1, nx: 1, nz: 0, len: D, ry: Math.PI / 2 },
  { id: 'W', ex: ISLAND.minX, ez: 0, tx: 0, tz: 1, nx: -1, nz: 0, len: D, ry: -Math.PI / 2 },
];
type Side = (typeof SIDES)[number];
const at = (s: Side, l: number, o: number) => ({ x: s.ex + s.tx * l + s.nx * o, z: s.ez + s.tz * l + s.nz * o });

export default function Island() {
  const sandA = useMemo(() => sandTex([W / 8, BEACH / 8]), []);
  const sandB = useMemo(() => sandTex([D / 8, BEACH / 8]), []);
  const waterA = useMemo(() => waterTex(90, '#0f6f93', '#bfeaf5'), []);
  const waterB = useMemo(() => waterTex(61, '#00000000', '#ffffff'), []);
  const foam = useRef<THREE.Group[]>([]);

  const dec = useMemo(() => {
    const r = rng(2026);
    const palms: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [];
    const umbPole: THREE.Matrix4[] = [], umbTop: THREE.Matrix4[] = [], umbCol: THREE.Color[] = [], umbPoleCol: THREE.Color[] = [];
    const lounger: THREE.Matrix4[] = [], loungerCol: THREE.Color[] = [], towel: THREE.Matrix4[] = [], towelCol: THREE.Color[] = [];
    const rocks: THREE.Matrix4[] = [], rockCol: THREE.Color[] = [];
    const hutBody: THREE.Matrix4[] = [], hutRoof: THREE.Matrix4[] = [], hutCol: THREE.Color[] = [];
    const tower: THREE.Matrix4[] = [], boat: THREE.Matrix4[] = [], boatCol: THREE.Color[] = [], buoy: THREE.Matrix4[] = [];
    const boxes: AABB[] = [];
    const UMB = ['#ff4d6d', '#ffd23f', '#22d3ee', '#a3e635', '#ff8a1f', '#c084fc', '#ffffff'];
    for (const s of SIDES) {
      for (let l = 6; l < s.len - 6; l += 5) {
        const p = (o: number, j = 0) => at(s, l + j, o);
        // a palm row at the back of the beach, with the odd bush
        if (r() < 0.6) { const q = p(-BEACH + 3 + r() * 3, (r() - 0.5) * 2), sc = 0.9 + r() * 0.5; palms.push(mat4(q.x, 0, q.z, sc, sc, sc, r() * 6.28)); boxes.push(boxFromCenter(q.x, q.z, 0.7, 0.7)); }
        if (r() < 0.25) { const q = p(-BEACH + 1.5 + r() * 2); bushes.push(mat4(q.x, 0, q.z, 1.2, 1.2, 1.2, r() * 6)); }
        // sun-bathing cluster: umbrella + two loungers + towel
        if (r() < 0.32) {
          const o = -8 - r() * 13, q = p(o), col = UMB[Math.floor(r() * UMB.length)], ry = r() * 6.28;
          umbPole.push(mat4(q.x, 1.1, q.z, 0.07, 2.2, 0.07)); umbPoleCol.push(new THREE.Color('#e8e8e8'));
          umbTop.push(mat4(q.x, 2.25, q.z, 2.4, 0.35, 2.4, ry)); umbCol.push(new THREE.Color(col));
          boxes.push(boxFromCenter(q.x, q.z, 0.3, 0.3));
          for (const k of [-1, 1]) { const a = at(s, l + k * 1.1, o + 0.9); lounger.push(mat4(a.x, 0.18, a.z, 0.65, 0.22, 1.7, Math.atan2(s.tx * 0 + s.nx, s.nz) + (k > 0 ? 0.08 : -0.08))); loungerCol.push(new THREE.Color(col)); }
          if (r() < 0.6) { const a = at(s, l + 2.6, o - 0.3); towel.push(mat4(a.x, 0.03, a.z, 0.8, 0.03, 1.7, r() * 3)); towelCol.push(new THREE.Color(UMB[Math.floor(r() * UMB.length)])); }
        }
        if (r() < 0.08) { const q = p(-4 - r() * 8), sc = 0.5 + r() * 1.1; rocks.push(mat4(q.x, sc * 0.3, q.z, sc * 1.4, sc * 0.7, sc, r() * 3)); rockCol.push(new THREE.Color(r() < 0.5 ? '#6b6f78' : '#8a8478')); boxes.push(boxFromCenter(q.x, q.z, sc * 1.3, sc * 1.1)); }
      }
      // lifeguard towers and beach huts
      for (let l = 40; l < s.len - 40; l += 95) {
        const q = at(s, l + (r() - 0.5) * 20, -12 - r() * 3);
        tower.push(mat4(q.x, 1.7, q.z, 1.6, 0.18, 1.6)); boxes.push(boxFromCenter(q.x, q.z, 1.8, 1.8));
        const h = at(s, l + 30, -BEACH + 7);
        hutBody.push(mat4(h.x, 1.3, h.z, 3.6, 2.6, 3.6, s.ry)); hutRoof.push(mat4(h.x, 2.8, h.z, 4.2, 0.35, 4.2, s.ry)); hutCol.push(new THREE.Color(UMB[Math.floor(r() * 6)]));
        boxes.push(boxFromCenter(h.x, h.z, 3.8, 3.8));
      }
      // boats + buoys out in the water
      for (let l = 30; l < s.len - 30; l += 70) {
        const q = at(s, l + (r() - 0.5) * 30, 14 + r() * 50);
        boat.push(mat4(q.x, 0.05, q.z, 1.5, 0.7, 4.2, r() * 3.14)); boatCol.push(new THREE.Color(UMB[Math.floor(r() * UMB.length)]));
        const b = at(s, l + 35, 6 + r() * 10); buoy.push(mat4(b.x, 0.1, b.z, 0.7, 0.7, 0.7));
      }
    }
    return { palms, bushes, umbPole, umbPoleCol, umbTop, umbCol, lounger, loungerCol, towel, towelCol, rocks, rockCol, hutBody, hutRoof, hutCol, tower, boat, boatCol, buoy, boxes };
  }, []);
  useEffect(() => registerColliders('island', dec.boxes), [dec]);

  const mats = useMemo(() => ({
    std: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8b6a45', roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    foam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }),
    buoy: new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 0.4 }),
  }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    waterA.offset.set(t * 0.004, t * 0.006); waterB.offset.set(-t * 0.006, t * 0.003);
    foam.current.forEach((g, i) => {
      if (!g) return;
      const w = Math.sin(t * 0.9 + i * 1.7);
      g.position.z = 5.5 + w * 1.6; (g.children[0] as THREE.Mesh).scale.y = 0.8 + 0.3 * w;
      mats.foam.opacity = 0.55 + 0.25 * Math.sin(t * 0.9);
    });
  });

  const lighthouse = { x: ISLAND.maxX + 70, z: ISLAND.halfZ + 55 };
  const beam = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.2); });

  return (
    <group>
      {/* the sea: deep base + a second drifting ripple layer */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.3, 0]}><planeGeometry args={[4000, 4000]} /><meshStandardMaterial map={waterA} roughness={0.25} metalness={0.15} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.26, 0]}><planeGeometry args={[4000, 4000]} /><meshBasicMaterial map={waterB} transparent opacity={0.5} depthWrite={false} /></mesh>

      {SIDES.map((s, i) => (
        <group key={s.id} position={[s.ex, 0, s.ez]} rotation-y={s.ry}>
          {/* dry sand */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.02 + i * 0.003, -BEACH / 2 + 3]}>
            <planeGeometry args={[s.len, BEACH - 6]} /><meshStandardMaterial map={s.id === 'N' || s.id === 'S' ? sandA : sandB} roughness={1} />
          </mesh>
          {/* wet sand + slope into the water */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03 + i * 0.003, -4.5]}><planeGeometry args={[s.len, 7]} /><meshStandardMaterial color="#b89a64" roughness={0.6} /></mesh>
          <mesh position={[0, -0.2, 3]} rotation-x={-Math.PI / 2 + 0.03}><planeGeometry args={[s.len, 14]} /><meshStandardMaterial color="#a98a56" roughness={0.5} /></mesh>
          <group ref={(g) => { if (g) foam.current[i] = g; }} position={[0, -0.27, 5.5]}>
            <mesh rotation-x={-Math.PI / 2} material={mats.foam}><planeGeometry args={[s.len, 1.6]} /></mesh>
          </group>
        </group>
      ))}

      <Instances geometry={getPalmGeo()} material={mats.leaf} matrices={dec.palms} cast />
      <Instances geometry={getBushGeo()} material={mats.leaf} matrices={dec.bushes} />
      <Instances geometry={BOX} material={mats.std} matrices={dec.umbPole} colors={dec.umbPoleCol} />
      <Instances geometry={new THREE.ConeGeometry(0.5, 1, 8)} material={mats.std} matrices={dec.umbTop} colors={dec.umbCol} />
      <Instances geometry={BOX} material={mats.std} matrices={dec.lounger} colors={dec.loungerCol} />
      <Instances geometry={BOX} material={mats.std} matrices={dec.towel} colors={dec.towelCol} />
      <Instances geometry={new THREE.DodecahedronGeometry(0.8, 0)} material={mats.std} matrices={dec.rocks} colors={dec.rockCol} />
      <Instances geometry={BOX} material={mats.std} matrices={dec.hutBody} colors={dec.hutCol} />
      <Instances geometry={BOX} material={mats.wood} matrices={dec.hutRoof} />
      <Instances geometry={BOX} material={mats.wood} matrices={dec.tower} />
      <Instances geometry={BOX} material={mats.std} matrices={dec.boat} colors={dec.boatCol} />
      <Instances geometry={new THREE.SphereGeometry(0.5, 8, 6)} material={mats.buoy} matrices={dec.buoy} />

      {/* lighthouse on a rock out at sea */}
      <group position={[lighthouse.x, 0, lighthouse.z]}>
        <mesh position={[0, 0.5, 0]}><dodecahedronGeometry args={[9, 0]} /><meshStandardMaterial color="#6b6f78" roughness={1} /></mesh>
        {[0, 1, 2, 3].map((k) => <mesh key={k} position={[0, 4 + k * 5, 0]}><cylinderGeometry args={[2.3 - k * 0.25, 2.5 - k * 0.25, 5, 12]} /><meshStandardMaterial color={k % 2 ? '#d62828' : '#f5f5f5'} roughness={0.7} /></mesh>)}
        <mesh position={[0, 25, 0]}><cylinderGeometry args={[1.6, 1.6, 2.6, 10]} /><meshBasicMaterial color="#ffe9a8" toneMapped={false} /></mesh>
        <mesh position={[0, 27.5, 0]}><coneGeometry args={[2.2, 2, 10]} /><meshStandardMaterial color="#2b2b30" /></mesh>
        <mesh ref={beam} position={[0, 25, 0]}><sphereGeometry args={[4, 12, 8]} /><meshBasicMaterial color="#fff2b8" transparent opacity={0.5} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      </group>
    </group>
  );
}
