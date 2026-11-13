'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { DISTRICTS } from '@/game/data/districts';
import { isDistrictUnlocked } from '@/lib/PriceSystem';
import { useGame } from '@/lib/store';
import { sfx } from '@/lib/audio';

const URLS = ['/mascot/m1.png', '/mascot/m2.png', '/mascot/m3.png', '/mascot/m4.png'];
const ASPECT = [360 / 622, 360 / 632, 360 / 621, 360 / 525];
const H = 3.3;          // comedic oversize
const SPEED = 1.7;      // m/s waddle
const LANE_Z = 6.2;     // walks the sidewalk beside the main street
const X_MIN = -42;

/**
 * Street mascot NPC: the inflatable-costume guy waddles back and forth along the main street,
 * stops every so often to wave / flash his props, then carries on. Billboard sprite (4 cartoon poses).
 * Only roams districts that are already unlocked. Harmless, ignorable, and a little too happy.
 */
export default function StreetMascot() {
  const tex = useTexture(URLS) as THREE.Texture[];
  tex.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; });
  const grp = useRef<THREE.Group>(null!);
  const sprite = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const peakRef = useRef(useGame.getState().peakPrice);
  const s = useRef({ x: 22, dir: 1, mode: 'walk' as 'walk' | 'pause', t: 6 + Math.random() * 4, frame: 0, pose: 2, bob: 0 });

  const maxX = () => {
    let m = DISTRICTS[0].cx + 48;
    for (const d of DISTRICTS) if (isDistrictUnlocked(d.id, peakRef.current)) m = d.cx + 48;
    return m;
  };
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1.5, 14), []);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = s.current;
    peakRef.current = useGame.getState().peakPrice;
    st.t -= dt;
    if (st.mode === 'walk') {
      st.x += st.dir * SPEED * dt; st.bob += dt * 7.5;
      const hi = maxX();
      if (st.x > hi) { st.x = hi; st.dir = -1; } else if (st.x < X_MIN) { st.x = X_MIN; st.dir = 1; }
      if (st.t <= 0) { st.mode = 'pause'; st.t = 3.2; st.pose = st.pose === 2 ? 3 : 2; if (Math.abs(camera.position.x - st.x) < 28) sfx.squeak(); } // wave, then props
      st.frame = st.dir > 0 ? 0 : 1;
    } else {
      st.bob += dt * 2.4;
      st.frame = st.pose;
      if (st.t <= 0) { st.mode = 'walk'; st.t = 8 + Math.random() * 8; if (Math.random() < 0.35) st.dir *= -1; }
    }
    const f = st.frame;
    const walking = st.mode === 'walk';
    const w = H * ASPECT[f];
    sprite.current.scale.set(w, H, 1);
    sprite.current.position.y = H / 2 + (walking ? Math.abs(Math.sin(st.bob)) * 0.16 : Math.sin(st.bob) * 0.03);
    sprite.current.rotation.z = walking ? Math.sin(st.bob) * 0.07 : 0;
    if (mat.current.map !== tex[f]) { mat.current.map = tex[f]; mat.current.needsUpdate = true; }
    grp.current.position.set(st.x, 0, LANE_Z);
    // face the camera around Y only (stays upright)
    grp.current.rotation.y = Math.atan2(camera.position.x - st.x, camera.position.z - LANE_Z);
    // cheap distance cull
    grp.current.visible = Math.abs(camera.position.x - st.x) < 130;
  });

  return (
    <group ref={grp}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} geometry={shadowGeo}>
        <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={sprite} position={[0, H / 2, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={mat} map={tex[0]} transparent alphaTest={0.35} color="#e6dff2" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
