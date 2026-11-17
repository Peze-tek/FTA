'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ThreeElements } from '@react-three/fiber';

/**
 * Box with softly bevelled edges and smooth normals (no hard jagged corner edges).
 * Geometry is built at the real size (not scaled) so the bevel stays an even radius, and cached per size.
 */
const cache = new Map<string, THREE.BufferGeometry>();
export function rboxGeo(w: number, h: number, d: number, maxR = 0.1) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${maxR}`;
  let g = cache.get(k);
  if (!g) {
    const r = Math.max(0.004, Math.min(maxR, Math.min(w, h, d) * 0.32));
    g = new RoundedBoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001), 3, r);
    cache.set(k, g);
  }
  return g;
}

type MeshProps = Omit<ThreeElements['mesh'], 'geometry' | 'scale'>;
export default function RBox({ size, maxR = 0.1, ...rest }: { size: [number, number, number]; maxR?: number } & MeshProps) {
  const [w, h, d] = size;
  const geo = useMemo(() => rboxGeo(w, h, d, maxR), [w, h, d, maxR]);
  return <mesh geometry={geo} {...rest} />;
}
