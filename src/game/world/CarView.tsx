'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SportsCar, CivCar } from '@/game/levels/Level4';
import type { DmgCar } from '@/lib/carDamage';

export interface ViewCar extends DmgCar {
  def: { kind: number; color?: string; accent?: string };
  x: number; z: number; yaw: number; g: THREE.Group | null;
}
const CHAR = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.95, metalness: 0.1 });
const PUFFS = 7;

/** A drivable car body with live damage: crumpling, smoke, flames, an explosion and a burnt-out shell. */
export default function CarView({ car }: { car: ViewCar }) {
  const ref = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const fire = useRef<THREE.Mesh>(null!);
  const blast = useRef<THREE.Mesh>(null!);
  const charred = useRef(false);
  useEffect(() => { car.g = ref.current; return () => { car.g = null; }; }, [car]);
  const puffMat = useMemo(() => Array.from({ length: PUFFS }, () => new THREE.MeshBasicMaterial({ color: '#555', transparent: true, opacity: 0.5, depthWrite: false })), []);
  const d = car.def;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, hpK = car.hp / 100;
    // crumple: lower, tilt, slightly squashed as damage builds
    const b = body.current;
    b.scale.set(1 - car.dent * 0.05, 1 - car.dent * 0.12, 1 - car.dent * 0.07);
    b.rotation.z = car.dent * 0.05 * Math.sin(car.x * 0.7 + 1);
    b.rotation.x = -car.dent * 0.03;
    if (car.wreck && !charred.current) {      // burnt-out shell
      charred.current = true;
      b.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = CHAR; });
    }
    const smoking = hpK < 0.6;
    for (let i = 0; i < PUFFS; i++) {
      const m = puffs.current[i]; if (!m) continue;
      if (!smoking) { m.visible = false; continue; }
      const k = ((t * 0.8 + i / PUFFS) % 1);
      m.visible = true;
      m.position.set(Math.sin(i * 2.1 + t) * 0.25 * k, 1.1 + k * 2.2, 1.3 - k * 0.6);
      m.scale.setScalar(0.25 + k * 0.9 * (car.wreck ? 1.4 : 1));
      puffMat[i].opacity = 0.5 * (1 - k);
      puffMat[i].color.set(hpK < 0.3 || car.wreck ? '#1f1f22' : '#8a8a90');
    }
    const burning = hpK < 0.25;
    fire.current.visible = burning;
    if (burning) { const f = 0.8 + Math.sin(t * 22) * 0.25 + Math.random() * 0.15; fire.current.scale.set(f, f * 1.5, f); fire.current.position.set(0, 1.15 + f * 0.1, 1.3); }
    if (car.boom > 0) {
      car.boom = Math.max(0, car.boom - dt * 1.6);
      blast.current.visible = true;
      const k = 1 - car.boom;
      blast.current.scale.setScalar(1 + k * 7);
      (blast.current.material as THREE.MeshBasicMaterial).opacity = car.boom * 0.85;
    } else blast.current.visible = false;
  });

  return (
    <group ref={ref} position={[car.x, 0, car.z]} rotation-y={car.yaw}>
      <group ref={body}>
        {d.kind === 0 ? <SportsCar color={d.color ?? '#ff2d55'} accent={d.accent ?? '#ffd24a'} /> : <CivCar kind={d.kind - 1} />}
      </group>
      {puffMat.map((m, i) => (
        <mesh key={i} ref={(e) => { puffs.current[i] = e; }} material={m} visible={false}><icosahedronGeometry args={[0.5, 0]} /></mesh>
      ))}
      <mesh ref={fire} visible={false}><octahedronGeometry args={[0.4, 0]} /><meshBasicMaterial color="#ff8a1f" toneMapped={false} /></mesh>
      <mesh ref={blast} position={[0, 1, 0]} visible={false}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.8} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}
