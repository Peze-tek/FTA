'use client';
import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { DISTRICTS } from '@/game/data/districts';
import { genBuildings } from '@/game/world/City';
import { rng } from '@/lib/rng';

const TINTS = ['#39ff88', '#ff4fd8', '#22d3ee', '#ffd23f', '#ff2d55', '#f8fafc'];
const KINDS = {
  turbo: { url: '/graffiti/turbo.png', aspect: 512 / 506, w: 6.2 },     // "FAP FAP FAP — TURBO MODE!"
  logo: { url: '/graffiti/fapcoin.png', aspect: 900 / 243, w: 7.2 },    // FAPCOIN ascii wordmark
} as const;
type Kind = keyof typeof KINDS;
interface Decal { kind: Kind; x: number; y: number; z: number; flip: boolean; tint: string; rot: number; w: number }

/**
 * Spray-paint graffiti on Fap City's walls: the "TURBO MODE" doodle and the FAPCOIN wordmark,
 * stuck on street-facing building fronts and on the bigger landmark walls. Deterministic placement.
 */
export default function Graffiti({ routes = false }: { routes?: boolean }) {
  const [turbo, logo] = useTexture([KINDS.turbo.url, KINDS.logo.url]) as THREE.Texture[];
  [turbo, logo].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; });
  const tex: Record<Kind, THREE.Texture> = { turbo, logo };

  const decals = useMemo(() => {
    const out: Decal[] = [];
    for (const d of DISTRICTS) {
      const r = rng(d.id * 131 + 7);
      // building fronts (front row only: |z| = 28, the face toward the street is at |z| = 24)
      for (const b of genBuildings(d, routes)) {
        if (Math.abs(b.z) !== 28 || r() > 0.4) continue;
        const kind: Kind = r() < 0.5 ? 'turbo' : 'logo';
        const k = KINDS[kind], w = k.w * (0.85 + r() * 0.2);
        out.push({
          kind, x: b.x + (r() - 0.5) * 0.6, y: kind === 'turbo' ? (w / k.aspect) / 2 + 0.8 : 3.4 + r() * 1.6,
          z: b.z < 0 ? -24.04 : 24.04, flip: b.z > 0, tint: TINTS[Math.floor(r() * TINTS.length)], rot: (r() - 0.5) * 0.12, w,
        });
      }
      // landmark walls (wide ones only, beside the door)
      for (const l of d.landmarks) {
        if (l.size[0] < 11 || l.kind === 'bridge') continue;
        const k = KINDS.turbo, w = 3.1, side = r() < 0.5 ? -1 : 1;
        const faceZ = l.pos[1] < 0 ? 1 : -1;
        out.push({
          kind: 'turbo', x: l.pos[0] + side * (l.size[0] / 2 - 2.0), y: Math.min(l.size[1] - 2.6, 1.3 + (w / k.aspect) / 2),
          z: l.pos[1] + faceZ * (l.size[2] / 2 + 0.05), flip: faceZ < 0, tint: TINTS[Math.floor(r() * TINTS.length)], rot: (r() - 0.5) * 0.15, w,
        });
      }
    }
    return out;
  }, [routes]);

  const mats = useMemo(() => {
    const m = new Map<string, THREE.MeshBasicMaterial>();
    for (const d of decals) {
      const key = d.kind + d.tint;
      if (!m.has(key)) m.set(key, new THREE.MeshBasicMaterial({
        map: tex[d.kind], color: d.tint, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.92,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decals, turbo, logo]);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  return (
    <group>
      {decals.map((d, i) => {
        const k = KINDS[d.kind];
        return (
          <mesh key={i} geometry={geo} material={mats.get(d.kind + d.tint)!}
            position={[d.x, d.y, d.z]} rotation={[0, d.flip ? Math.PI : 0, d.rot]} scale={[d.w, d.w / k.aspect, 1]} />
        );
      })}
    </group>
  );
}
