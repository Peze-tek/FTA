'use client';
import RBox from '@/game/RBox';
import { useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { BOX, toon, glow } from '@/game/materials';
import { newAnim, type AnimState } from '@/lib/anim';
import type { CharId } from '@/lib/types';
import { ts } from '@/lib/timeScale';

type V3 = [number, number, number];

interface Spec { skin: string; top: string; legs: string; shoe: string; w: number; head: number; scale: number }
const SPEC: Record<CharId, Spec> = {
  jake: { skin: '#c27a3e', top: '#0f0f12', legs: '#0b0b0e', shoe: '#19b9c4', w: 1, head: 0.46, scale: 1 },
  brandon: { skin: '#8d5524', top: '#ef4444', legs: '#111827', shoe: '#f8fafc', w: 1.12, head: 0.46, scale: 1 },
  pol: { skin: '#a0522d', top: '#ff7ac8', legs: '#fbbf24', shoe: '#fde047', w: 1.35, head: 0.46, scale: 1 },
  robofap: { skin: '#4a4744', top: '#0f0f12', legs: '#47443f', shoe: '#2b2927', w: 1, head: 0.46, scale: 1 },
  paperhands: { skin: '#f1d6c1', top: '#e5e7eb', legs: '#64748b', shoe: '#cbd5e1', w: 0.68, head: 0.46, scale: 0.96 },
  meast: { skin: '#b9661f', top: '#0f0f12', legs: '#22407f', shoe: '#e11d2e', w: 1.75, head: 0.46, scale: 1.5 },
  tek: { skin: '#5c3a21', top: '#16a34a', legs: '#0f172a', shoe: '#f8fafc', w: 1, head: 0.46, scale: 1 },
  rugpull: { skin: '#e0ac69', top: '#0b0b0f', legs: '#0b0b0f', shoe: '#111827', w: 1.35, head: 0.46, scale: 1.35 },
  guard: { skin: '#d1a37a', top: '#111827', legs: '#111827', shoe: '#000000', w: 1.1, head: 0.44, scale: 1.05 },
  bear: { skin: '#92400e', top: '#78350f', legs: '#1c1917', shoe: '#000000', w: 1.9, head: 0.5, scale: 1.6 },
  worker: { skin: '#b9835a', top: '#475569', legs: '#1e293b', shoe: '#0f172a', w: 1, head: 0.44, scale: 1 },
  og: { skin: '#a8754f', top: '#39ff88', legs: '#1e293b', shoe: '#0f172a', w: 1, head: 0.44, scale: 0.9 },
  biker: { skin: '#c68642', top: '#ef4444', legs: '#111827', shoe: '#000000', w: 1.1, head: 0.46, scale: 1 },
};

/* ---- Jack's custom textures (canvas, built once): "FAP CLUB" tee print + sleeve/neck tattoos */
let _shirt: THREE.MeshStandardMaterial | null = null;
let _tat: THREE.MeshStandardMaterial | null = null;
function shirtMat() {
  if (_shirt) return _shirt;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 112px Impact, "Arial Black", sans-serif';
  const grad = x.createLinearGradient(0, 40, 0, 220);
  grad.addColorStop(0, '#f3dcc0'); grad.addColorStop(0.55, '#e8c7a4'); grad.addColorStop(1, '#b3121c');
  x.fillStyle = grad; x.strokeStyle = '#7f0f16'; x.lineWidth = 3;
  x.fillText('FAP', 128, 84); x.strokeText('FAP', 128, 84);
  x.font = '900 100px Impact, "Arial Black", sans-serif';
  x.fillText('CLUB', 128, 184); x.strokeText('CLUB', 128, 184);
  // blood-red splatter
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#c1121f';
  for (let i = 0; i < 70; i++) { x.globalAlpha = 0.4 + r() * 0.6; x.beginPath(); x.arc(20 + r() * 216, 25 + r() * 205, 0.8 + r() * 3.2, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _shirt = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return _shirt;
}
function tattooMat() {
  if (_tat) return _tat;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c27a3e'; x.fillRect(0, 0, 128, 128);
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.strokeStyle = '#3d2615'; x.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    x.globalAlpha = 0.55 + r() * 0.4; x.lineWidth = 1.2 + r() * 2.6;
    const px = r() * 128, py = r() * 128;
    x.beginPath(); x.moveTo(px, py);
    x.bezierCurveTo(px + (r() - 0.5) * 50, py + (r() - 0.5) * 50, px + (r() - 0.5) * 50, py + (r() - 0.5) * 50, px + (r() - 0.5) * 60, py + (r() - 0.5) * 60);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  _tat = new THREE.MeshStandardMaterial({ map: t });
  return _tat;
}

/* ---- Meast's look: white-print "FAP CLUB" tee + full tattoo sleeve (maple-leaf flag, bear + pines, Korean flag, fist) */
let _mShirt: THREE.MeshStandardMaterial | null = null;
let _mTat: THREE.MeshStandardMaterial | null = null;
function meastShirtMat() {
  if (_mShirt) return _mShirt;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f4f1ea';
  x.font = '900 118px Impact, "Arial Black", sans-serif';
  x.fillText('FAP', 128, 80);
  x.font = '900 104px Impact, "Arial Black", sans-serif';
  x.fillText('CLUB', 128, 186);
  // worn-print specks
  let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { x.globalAlpha = 0.25 + r() * 0.5; x.beginPath(); x.arc(r() * 256, r() * 256, 0.6 + r() * 1.8, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _mShirt = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return _mShirt;
}
function meastTattooMat() {
  if (_mTat) return _mTat;
  const W = 128, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  let seed = 23; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#b9661f'; x.fillRect(0, 0, W, H);
  // dense dark ink body
  x.fillStyle = '#3a2110'; x.fillRect(0, 64, W, 190);
  x.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = r() < 0.5 ? '#6b3d18' : '#1c1008'; x.globalAlpha = 0.6 + r() * 0.4; x.lineWidth = 1 + r() * 2.2;
    const px = r() * W, py = 64 + r() * 190;
    x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + (r() - 0.5) * 40, py + (r() - 0.5) * 40, px + (r() - 0.5) * 40, py + (r() - 0.5) * 40, px + (r() - 0.5) * 50, py + (r() - 0.5) * 50); x.stroke();
  }
  x.globalAlpha = 1;
  // Canadian flag (top of the sleeve)
  x.fillStyle = '#d52b1e'; x.fillRect(0, 22, W, 44);
  x.fillStyle = '#ffffff'; x.fillRect(30, 22, 68, 44);
  x.fillStyle = '#d52b1e'; x.beginPath();
  const cx = 64, cy = 44;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rad = i % 2 ? 7 : 16; x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  x.fill();
  // bear (brown blob + face) and pines
  x.fillStyle = '#8a5a2b'; x.beginPath(); x.ellipse(52, 98, 26, 20, 0, 0, 7); x.fill();
  x.fillStyle = '#2b1608'; x.fillRect(44, 94, 5, 5); x.fillRect(58, 94, 5, 5); x.fillRect(48, 104, 12, 4);
  x.fillStyle = '#e8d9bd'; x.fillRect(48, 110, 3, 5); x.fillRect(57, 110, 3, 5);
  x.fillStyle = '#1f5a2e';
  for (const px of [96, 112]) { x.beginPath(); x.moveTo(px, 80); x.lineTo(px - 9, 112); x.lineTo(px + 9, 112); x.fill(); }
  // Korean flag
  x.fillStyle = '#ffffff'; x.fillRect(18, 132, 92, 62);
  x.fillStyle = '#cd2e3a'; x.beginPath(); x.arc(64, 163, 15, Math.PI, 0); x.fill();
  x.fillStyle = '#0047a0'; x.beginPath(); x.arc(64, 163, 15, 0, Math.PI); x.fill();
  x.fillStyle = '#111';
  for (const [bx, by] of [[24, 137], [96, 137], [24, 178], [96, 178]]) { x.fillRect(bx, by, 10, 2); x.fillRect(bx, by + 4, 10, 2); x.fillRect(bx, by + 8, 10, 2); }
  // fist
  x.fillStyle = '#121212'; x.fillRect(34, 204, 52, 28);
  for (let i = 0; i < 4; i++) x.fillRect(34 + i * 13, 198, 11, 9);
  x.fillStyle = '#e8d9bd'; x.fillRect(40, 214, 40, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  _mTat = new THREE.MeshStandardMaterial({ map: t });
  return _mTat;
}

/* ---- Robofap's chrome cyborg arm (right side): shoulder joint, piston upper arm, elbow, banded forearm, big metal fist */
let _chrome: THREE.MeshStandardMaterial | null = null;
let _pipe: THREE.MeshStandardMaterial | null = null;
function RoboArm() {
  if (!_chrome) {
    _chrome = new THREE.MeshStandardMaterial({ color: '#d5dbe3', metalness: 0.95, roughness: 0.2, envMapIntensity: 1.7 });
    _pipe = new THREE.MeshStandardMaterial({ color: '#15171b', metalness: 0.6, roughness: 0.5 });
  }
  const C = _chrome, P = _pipe!;
  return (
    <group>
      <mesh material={C} position={[0.03, -0.02, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.15, 0.15, 0.22, 24]} /></mesh>
      <mesh material={glow('#22d3ee')} position={[0.15, -0.02, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.07, 0.07, 0.03, 24]} /></mesh>
      <mesh material={C} position={[0, -0.27, 0]}><cylinderGeometry args={[0.1, 0.12, 0.36, 24]} /></mesh>
      <mesh material={P} position={[0.09, -0.27, 0.07]}><cylinderGeometry args={[0.025, 0.025, 0.4, 10]} /></mesh>
      <mesh material={P} position={[-0.08, -0.27, 0.08]}><cylinderGeometry args={[0.02, 0.02, 0.4, 10]} /></mesh>
      <mesh material={C} position={[0, -0.49, 0]}><sphereGeometry args={[0.14, 28, 18]} /></mesh>
      <mesh material={glow('#22d3ee')} position={[0.12, -0.49, 0.06]}><sphereGeometry args={[0.035, 14, 10]} /></mesh>
      <mesh material={C} position={[0, -0.72, 0.02]}><cylinderGeometry args={[0.16, 0.13, 0.4, 24]} /></mesh>
      {[-0.6, -0.84].map((y) => <mesh key={y} material={P} position={[0, y, 0.02]}><cylinderGeometry args={[0.172, 0.172, 0.04, 24]} /></mesh>)}
      <mesh material={C} position={[0, -0.97, 0.05]}><boxGeometry args={[0.3, 0.2, 0.34]} /></mesh>
      {[-0.105, -0.035, 0.035, 0.105].map((x, i) => (
        <group key={i}>
          <mesh material={C} position={[x, -1.0, 0.25]}><boxGeometry args={[0.066, 0.14, 0.09]} /></mesh>
          <mesh material={P} position={[x, -1.0, 0.3]}><boxGeometry args={[0.05, 0.06, 0.03]} /></mesh>
        </group>
      ))}
      <mesh material={C} position={[0.16, -0.95, 0.12]} rotation-z={0.5}><boxGeometry args={[0.07, 0.14, 0.1]} /></mesh>
    </group>
  );
}

function B({ p = [0, 0, 0], s, c, e, r }: { p?: V3; s: V3; c: string; e?: string; r?: V3 }) {
  return <RBox size={s} maxR={0.045} material={toon(c, e)} position={p} rotation={r} />;
}
function G({ p = [0, 0, 0], s, c, r }: { p?: V3; s: V3; c: string; r?: V3 }) {
  return <RBox size={s} maxR={0.03} material={glow(c)} position={p} rotation={r} />;
}

interface Props {
  kind: CharId;
  anim?: MutableRefObject<AnimState>;
  label?: string;
  scale?: number;
  idle?: boolean;
  /** per-instance colour/size overrides (used for one-off NPCs like the boardroom KOLs) */
  look?: Partial<Spec>;
}

/**
 * Low-poly "Telegram sticker" rig built from boxes + cel-shaded toon materials.
 * Big head, chunky limbs. Faces +Z. ~1.8 units tall before scaling.
 */
export default function Character({ kind, anim, label, scale = 1, idle = true, look }: Props) {
  const sp = look ? { ...SPEC[kind], ...look } : SPEC[kind];
  const own = useRef<AnimState>(newAnim());
  const a = anim ?? own;
  const root = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const puff = useRef<THREE.Mesh>(null!);
  const orbit = useRef<THREE.Group>(null!);
  const eye = useRef<THREE.Mesh>(null!);
  const aura = useRef<THREE.Mesh>(null!);

  const { w, head: hs } = sp;
  const aw = 1 + (w - 1) * 0.6;
  const tw = 0.56 * w;
  const hipX = 0.13 * (0.6 + 0.4 * w);
  const shX = tw / 2 + 0.09 * aw;

  const [dead, setDead] = useState(false);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = a.current;
    if (!!s.dead !== dead) setDead(!!s.dead);   // name tag vanishes once they're down
    const t = st.clock.elapsedTime;
    const sw = Math.sin(t * 11) * 0.9 * s.speed;
    legL.current.rotation.x = sw;
    legR.current.rotation.x = -sw;
    armL.current.rotation.x = -sw * 0.8;
    armR.current.rotation.x = sw * 0.8;

    // breathing
    const br = Math.sin(t * 2 + kind.length) * 0.012;
    torso.current.scale.y = 1 + br;
    head.current.position.y = 1.7 + br * 0.6;

    if (idle && s.speed < 0.05) {
      if (kind === 'brandon') {
        const ph = t % 5;
        const raise = ph < 2.2 ? Math.min(1, Math.min(ph, 2.2 - ph) * 3) : 0;
        armR.current.rotation.x = -2.2 * raise; // vape hit
        if (puff.current) {
          const k = (ph - 1.6) / 3; // cloud lifetime
          const vis = k > 0 && k < 1;
          puff.current.visible = vis;
          if (vis) {
            puff.current.position.set(0, 1.78 + k * 0.7, 0.35 + k * 0.4);
            puff.current.scale.setScalar(0.5 + k * 2);
            (puff.current.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
          }
        }
      } else if (kind === 'pol') {
        armL.current.rotation.x = -1.1; armR.current.rotation.x = -1.1; // holding 2 phones up
      } else if (kind === 'paperhands') {
        root.current.position.x = Math.sin(t * 48) * 0.025;
        armL.current.rotation.x = -0.5 + Math.sin(t * 30) * 0.2;
        armR.current.rotation.x = -0.5 + Math.cos(t * 30) * 0.2;
      } else if (kind === 'meast') {
        const f = Math.sin(t * 1.5) * 0.06;
        armL.current.rotation.x = f; armR.current.rotation.x = f; // chest breathing flex
      } else if (kind === 'tek') {
        armL.current.rotation.x = -0.9; // typing on laptop
        armL.current.rotation.x += Math.sin(t * 14) * 0.08;
      }
    }
    if (kind === 'brandon' && puff.current && s.speed >= 0.05) puff.current.visible = false;
    if (kind === 'brandon' && orbit.current) orbit.current.rotation.y = t * 1.4;
    if (kind === 'robofap' && eye.current) {
      const m = eye.current.material as THREE.MeshBasicMaterial;
      m.color.setHSL(0.5, 1, 0.5 + Math.sin(t * 4) * 0.12);
    }

    // action animations
    if (s.punch > 0) {
      armR.current.rotation.x = -1.7 * Math.sin(Math.min(1, s.punch) * Math.PI) - 0.2;
      s.punch = Math.max(0, s.punch - dt * 3.6);
    }
    if (s.hit > 0) {
      root.current.rotation.z = Math.sin(s.hit * 24) * 0.18 * s.hit;
      s.hit = Math.max(0, s.hit - dt * 3);
    } else root.current.rotation.z = 0;
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, s.dead ? -Math.PI / 2 : 0, 1 - Math.pow(0.85, Math.min(3, dt * 60) * ts.scale));
    root.current.scale.y = THREE.MathUtils.lerp(root.current.scale.y, s.crouch ? 0.78 : 1, 0.25);
    if (aura.current) {
      aura.current.visible = s.special > 0;
      if (s.special > 0) aura.current.scale.setScalar(1.6 + Math.sin(t * 20) * 0.15);
    }
  });

  const showLabel = label !== undefined && !dead;

  return (
    <group scale={sp.scale * scale}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.55 * Math.max(1, w * 0.7), 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={root}>
        {/* legs */}
        <group ref={legL} position={[-hipX, 0.8, 0]}>
          <B p={[0, -0.38, 0]} s={[0.22 * aw, 0.76, 0.26]} c={sp.legs} />
          <B p={[0, -0.76, 0.05]} s={[0.25 * aw, 0.1, 0.38]} c={sp.shoe} />
          {kind === 'jake' && (<>
            <B p={[0, -0.8, 0.05]} s={[0.26 * aw, 0.04, 0.4]} c="#d8f3f5" />
            <B p={[-0.115 * aw, -0.3, 0.02]} s={[0.04, 0.22, 0.2]} c="#18181d" />
          </>)}
          {kind === 'meast' && (<>
            <B p={[0, -0.8, 0.05]} s={[0.27 * aw, 0.05, 0.4]} c="#f8fafc" />{/* white sole */}
            <B p={[0, -0.72, 0.2]} s={[0.2 * aw, 0.04, 0.12]} c="#f8fafc" />{/* laces */}
          </>)}
        </group>
        <group ref={legR} position={[hipX, 0.8, 0]}>
          <B p={[0, -0.38, 0]} s={[0.22 * aw, 0.76, 0.26]} c={sp.legs} />
          <B p={[0, -0.76, 0.05]} s={[0.25 * aw, 0.1, 0.38]} c={sp.shoe} />
          {kind === 'jake' && (<>
            <B p={[0, -0.8, 0.05]} s={[0.26 * aw, 0.04, 0.4]} c="#d8f3f5" />
            <B p={[0.115 * aw, -0.3, 0.02]} s={[0.04, 0.22, 0.2]} c="#18181d" />
          </>)}
          {kind === 'meast' && (<>
            <B p={[0, -0.8, 0.05]} s={[0.27 * aw, 0.05, 0.4]} c="#f8fafc" />
            <B p={[0, -0.72, 0.2]} s={[0.2 * aw, 0.04, 0.12]} c="#f8fafc" />
          </>)}
        </group>

        {/* torso */}
        <group ref={torso} position={[0, 1.15, 0]}>
          <B s={[tw, 0.7, 0.32 * (1 + (w - 1) * 0.4)]} c={sp.top} />
          {kind === 'jake' && (<>
            {/* black tee with the FAP CLUB print */}
            <mesh material={shirtMat()} position={[0, 0.03, 0.166]}><planeGeometry args={[tw * 0.86, tw * 0.86]} /></mesh>
          </>)}
          {kind === 'brandon' && (<>
            <B p={[0, -0.05, 0.17]} s={[tw * 0.9, 0.5, 0.03]} c="#f8fafc" />{/* apron */}
            <B p={[0, 0.0, 0.19]} s={[0.12, 0.12, 0.02]} c="#ef4444" />
            <group ref={orbit}>{/* 3 phones: one orbiting pair + one in hand */}
              <G p={[0.72, 0.3, 0]} s={[0.14, 0.24, 0.03]} c="#7dd3fc" />
              <G p={[-0.72, 0.1, 0]} s={[0.14, 0.24, 0.03]} c="#a5f3fc" />
            </group>
          </>)}
          {kind === 'pol' && (<>
            {/* big pink fur coat: chunky fluff boxes */}
            <B p={[0, -0.02, 0]} s={[tw + 0.28, 0.78, 0.5]} c="#ff9bd9" />
            {[-0.5, -0.25, 0, 0.25, 0.5].map((x, i) => (
              <B key={i} p={[x * (w / 1.35), -0.42 + (i % 2) * 0.05, 0.15]} s={[0.2, 0.18, 0.3]} c="#ffc2ea" />
            ))}
            <B p={[0, 0.36, 0.0]} s={[tw + 0.4, 0.14, 0.55]} c="#ffd1f0" />{/* fur collar */}
            <G p={[0, 0.0, 0.28]} s={[0.1, 0.1, 0.02]} c="#fde047" />
          </>)}
          {kind === 'robofap' && (<>
            <mesh material={meastShirtMat()} position={[-tw * 0.2, 0.14, 0.166]}><planeGeometry args={[tw * 0.5, tw * 0.5]} /></mesh>{/* FAP CLUB print */}
            <G p={[0.02, -0.1, 0.17]} s={[0.17, 0.22, 0.02]} c="#22d3ee" />{/* glowing core through the torn tee */}
            <B p={[-0.02, -0.12, 0.172]} s={[0.04, 0.34, 0.01]} c="#d9d6d1" r={[0, 0, 0.7]} />{/* tear marks */}
            <B p={[0.12, -0.2, 0.172]} s={[0.03, 0.26, 0.01]} c="#d9d6d1" r={[0, 0, 0.7]} />
            <B p={[-0.12, -0.2, 0.172]} s={[0.03, 0.2, 0.01]} c="#d9d6d1" r={[0, 0, 0.7]} />
          </>)}
          {kind === 'meast' && (<>
            <mesh material={meastShirtMat()} position={[0, 0.03, 0.21]}><planeGeometry args={[tw * 0.84, tw * 0.84]} /></mesh>{/* FAP CLUB print */}
            <B p={[0, -0.355, 0]} s={[tw + 0.02, 0.07, 0.43]} c="#7a4a24" />{/* leather belt */}
            <B p={[0, -0.355, 0.22]} s={[0.17, 0.1, 0.03]} c="#b6bcc6" />{/* silver buckle */}
            <B p={[0, -0.355, 0.24]} s={[0.08, 0.05, 0.015]} c="#6b7280" />
          </>)}
          {kind === 'tek' && (<>
            <B p={[0, 0.34, -0.2]} s={[0.46, 0.3, 0.18]} c="#15803d" />{/* hood */}
            <B p={[0.05, -0.1, 0.24]} s={[0.46, 0.04, 0.34]} c="#94a3b8" r={[0.25, 0, 0]} />{/* laptop under arm */}
            <G p={[0.05, -0.08, 0.27]} s={[0.4, 0.02, 0.26]} c="#39ff88" r={[0.25, 0, 0]} />
          </>)}
          {kind === 'rugpull' && (<>
            <B p={[0, 0.1, 0.17]} s={[0.12, 0.5, 0.02]} c="#f8fafc" />{/* shirt */}
            <B p={[0, 0, 0.18]} s={[0.1, 0.5, 0.03]} c="#7f1d1d" r={[0, 0, 0]} />{/* tie */}
            <G p={[0, 0.2, 0.2]} s={[0.5, 0.05, 0.03]} c="#fbbf24" />{/* gold chain */}
            <G p={[0, 0.02, 0.22]} s={[0.16, 0.16, 0.04]} c="#fde047" />{/* FAPCOIN medallion */}
          </>)}
          {kind === 'guard' && <G p={[0.2, 0.2, 0.17]} s={[0.15, 0.08, 0.02]} c="#ff2d55" />}
          {kind === 'bear' && (<>
            <B p={[0, 0, 0]} s={[tw + 0.3, 0.8, 0.55]} c="#a16207" />{/* fur coat */}
            <B p={[0, 0.4, 0]} s={[tw + 0.45, 0.14, 0.6]} c="#ca8a04" />
          </>)}
          {kind === 'worker' && <B p={[0, 0.1, 0.17]} s={[0.2, 0.2, 0.02]} c="#94a3b8" />}
        </group>

        {/* arms */}
        <group ref={armL} position={[-shX, 1.46, 0]}>
          {kind === 'jake'
            ? <mesh geometry={BOX} material={tattooMat()} position={[0, -0.3, 0]} scale={[0.17 * aw, 0.62, 0.2 * aw]} />
            : kind === 'meast'
              ? <mesh geometry={BOX} material={meastTattooMat()} position={[0, -0.3, 0]} scale={[0.17 * aw, 0.62, 0.2 * aw]} />
              : <B p={[0, -0.3, 0]} s={[0.17 * aw, 0.62, 0.2 * aw]} c={kind === 'robofap' ? '#d9d6d1' : sp.top} />}
          {kind === 'jake' && <B p={[0, -0.08, 0]} s={[0.21 * aw, 0.26, 0.25 * aw]} c="#0f0f12" />}
          {kind === 'robofap' && <B p={[0, -0.05, 0]} s={[0.21, 0.18, 0.25]} c="#0f0f12" />}
          <B p={[0, -0.66, 0]} s={[0.17 * aw, 0.17 * aw, 0.17 * aw]} c={kind === 'robofap' ? '#cfccc7' : sp.skin} />
          {kind === 'brandon' && <G p={[0, -0.78, 0.08]} s={[0.12, 0.02, 0.2]} c="#7dd3fc" />}
          {kind === 'pol' && <G p={[0, -0.8, 0.1]} s={[0.16, 0.02, 0.26]} c="#fef08a" />}
        </group>
        <group ref={armR} position={[shX, 1.46, 0]}>
          {kind === 'jake'
            ? <mesh geometry={BOX} material={tattooMat()} position={[0, -0.3, 0]} scale={[0.17 * aw, 0.62, 0.2 * aw]} />
            : kind === 'robofap' ? <RoboArm />
            : <B p={[0, -0.3, 0]} s={[0.17 * aw, 0.62, 0.2 * aw]} c={kind === 'meast' ? sp.skin : sp.top} />}
          {kind === 'jake' && <B p={[0, -0.08, 0]} s={[0.21 * aw, 0.26, 0.25 * aw]} c="#0f0f12" />}
          {kind === 'meast' && <B p={[0, -0.04, 0]} s={[0.21 * aw, 0.16, 0.25 * aw]} c="#0f0f12" />}
          {kind !== 'robofap' && <B p={[0, -0.66, 0]} s={[0.17 * aw, 0.17 * aw, 0.17 * aw]} c={sp.skin} />}
          {kind === 'brandon' && <B p={[0, -0.78, 0.1]} s={[0.05, 0.05, 0.16]} c="#0f172a" />}{/* vape */}
          {kind === 'pol' && <><G p={[0, -0.8, 0.1]} s={[0.16, 0.02, 0.26]} c="#fef08a" /><G p={[0.03, -0.8, 0.24]} s={[0.05, 0.02, 0.03]} c="#ff2d55" /></>}
          {kind === 'rugpull' && <B p={[0, -0.78, 0.1]} s={[0.06, 0.06, 0.34]} c="#e5e7eb" />}
        </group>

        {/* head */}
        <group ref={head} position={[0, 1.7, 0]}>
          <B s={[hs, hs, hs]} c={sp.skin} />
          {kind !== 'bear' && (<>
            <B p={[-hs * 0.22, 0.03, hs / 2 + 0.005]} s={[0.07, kind === 'paperhands' ? 0.14 : 0.09, 0.02]} c={kind === 'paperhands' ? '#ffffff' : '#0b0b0f'} />
            <B p={[hs * 0.22, 0.03, hs / 2 + 0.005]} s={[0.07, kind === 'paperhands' ? 0.14 : 0.09, 0.02]} c={kind === 'paperhands' ? '#ffffff' : '#0b0b0f'} />
            {kind === 'paperhands' && (<>
              <B p={[-hs * 0.22, 0.03, hs / 2 + 0.02]} s={[0.03, 0.04, 0.01]} c="#0b0b0f" />
              <B p={[hs * 0.22, 0.03, hs / 2 + 0.02]} s={[0.03, 0.04, 0.01]} c="#0b0b0f" />
              <G p={[hs / 2 + 0.01, 0.1, 0.1]} s={[0.04, 0.1, 0.04]} c="#7dd3fc" />{/* sweat drop */}
            </>)}
            <B p={[0, -hs * 0.25, hs / 2 + 0.005]} s={[0.14, 0.03, 0.02]} c="#3b1d0f" />
          </>)}
          {kind === 'jake' && (<>
            {/* tan baseball cap, brim forward */}
            <B p={[0, hs / 2 + 0.03, 0]} s={[hs + 0.07, 0.17, hs + 0.07]} c="#d8b384" />
            <B p={[0, hs / 2 - 0.02, hs / 2 + 0.12]} s={[hs * 0.92, 0.035, 0.26]} c="#cda673" />
            <B p={[0, hs / 2 + 0.13, 0]} s={[0.06, 0.04, 0.06]} c="#c49a68" />{/* button */}
            <B p={[0, hs / 2 - 0.08, 0]} s={[hs + 0.075, 0.03, hs + 0.075]} c="#b8915f" />{/* band shade */}
            {/* black hair under the cap + beard */}
            <B p={[0, 0.02, -hs / 2 - 0.02]} s={[hs + 0.03, hs * 0.62, 0.1]} c="#0d0b0a" />
            <B p={[-hs / 2 - 0.01, 0.04, -0.02]} s={[0.04, hs * 0.5, hs * 0.7]} c="#0d0b0a" />
            <B p={[hs / 2 + 0.01, 0.04, -0.02]} s={[0.04, hs * 0.5, hs * 0.7]} c="#0d0b0a" />
            <B p={[0, -hs * 0.27, hs / 2 + 0.012]} s={[hs * 0.9, hs * 0.38, 0.03]} c="#0d0b0a" />{/* beard */}
            <B p={[0, -hs * 0.12, hs / 2 + 0.03]} s={[hs * 0.4, 0.045, 0.02]} c="#0d0b0a" />{/* moustache */}
            <B p={[0, -hs * 0.33, hs / 2 + 0.035]} s={[0.11, 0.025, 0.02]} c="#3b1d0f" />{/* mouth */}
            <mesh geometry={BOX} material={tattooMat()} position={[0, -hs / 2 - 0.03, 0]} scale={[0.24, 0.12, 0.24]} />{/* neck tattoo */}
          </>)}
          {kind === 'brandon' && (<>
            <B p={[0, hs / 2 + 0.05, 0]} s={[hs + 0.04, 0.12, hs + 0.04]} c="#f8fafc" />{/* paper hat */}
            <B p={[0, hs / 2 + 0.14, 0]} s={[hs * 0.7, 0.1, hs * 0.7]} c="#ef4444" />
            <mesh ref={puff} visible={false}>
              <icosahedronGeometry args={[0.18, 0]} />
              <meshBasicMaterial color="#e5e7eb" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          </>)}
          {kind === 'pol' && (<>
            <B p={[0, hs / 2 + 0.02, -0.02]} s={[hs + 0.14, 0.16, hs + 0.1]} c="#fcd34d" />{/* big blonde hair */}
            <B p={[0, -0.1, -0.2]} s={[hs + 0.14, hs + 0.1, 0.2]} c="#fcd34d" />
            <G p={[-hs / 2 - 0.02, -0.15, 0]} s={[0.05, 0.1, 0.05]} c="#fde047" />
            <G p={[hs / 2 + 0.02, -0.15, 0]} s={[0.05, 0.1, 0.05]} c="#fde047" />
          </>)}
          {kind === 'robofap' && (<>
            <B p={[-hs * 0.25, 0, 0.0]} s={[hs * 0.5 + 0.02, hs + 0.02, hs + 0.02]} c="#dcd9d5" />{/* light half of the face */}
            <B p={[hs * 0.22, 0.03, hs / 2 + 0.012]} s={[0.12, 0.12, 0.02]} c="#0b0b0f" />{/* dead right eye */}
            <B p={[0, -hs * 0.24, hs / 2 + 0.012]} s={[0.2, 0.025, 0.02]} c="#0b0b0f" />{/* flat mouth */}
            <mesh ref={eye} geometry={BOX} position={[-hs * 0.22, 0.04, hs / 2 + 0.03]} scale={[0.17, 0.17, 0.04]}>
              <meshBasicMaterial color="#22d3ee" toneMapped={false} />
            </mesh>
            <B p={[-hs * 0.3, hs / 2 + 0.12, 0]} s={[0.03, 0.22, 0.03]} c="#94a3b8" />
            <G p={[-hs * 0.3, hs / 2 + 0.26, 0]} s={[0.07, 0.07, 0.07]} c="#ff2d55" />
          </>)}
          {kind === 'paperhands' && <B p={[0, hs / 2 + 0.02, 0]} s={[hs * 0.6, 0.05, hs * 0.6]} c="#d6d3d1" />}
          {kind === 'meast' && (<>
            <B p={[0, hs / 2 + 0.07, 0]} s={[hs + 0.02, 0.15, hs + 0.02]} c="#2a1b14" />{/* flat-top hair */}
            <B p={[0, hs * 0.2, 0]} s={[hs + 0.05, 0.1, hs + 0.05]} c="#e0252f" />{/* red headband */}
            {/* black-rim glasses */}
            {[-1, 1].map((sd) => (<group key={sd}>
              <B p={[sd * hs * 0.22, 0.075, hs / 2 + 0.02]} s={[0.17, 0.025, 0.02]} c="#0b0b0f" />
              <B p={[sd * hs * 0.22, -0.045, hs / 2 + 0.02]} s={[0.17, 0.025, 0.02]} c="#0b0b0f" />
              <B p={[sd * (hs * 0.22 - 0.0825), 0.015, hs / 2 + 0.02]} s={[0.025, 0.13, 0.02]} c="#0b0b0f" />
              <B p={[sd * (hs * 0.22 + 0.0825), 0.015, hs / 2 + 0.02]} s={[0.025, 0.13, 0.02]} c="#0b0b0f" />
              <B p={[sd * (hs / 2 + 0.005), 0.05, 0]} s={[0.02, 0.025, hs]} c="#0b0b0f" />{/* temple arm */}
            </group>))}
            <B p={[0, 0.03, hs / 2 + 0.02]} s={[0.07, 0.025, 0.02]} c="#0b0b0f" />{/* bridge */}
          </>)}
          {kind === 'tek' && (<>
            <B p={[0, hs / 2 + 0.03, 0]} s={[hs + 0.02, 0.08, hs + 0.02]} c="#0b0b0f" />
            <B p={[-hs * 0.22, 0.03, hs / 2 + 0.03]} s={[0.14, 0.12, 0.02]} c="#0f172a" />{/* glasses */}
            <B p={[hs * 0.22, 0.03, hs / 2 + 0.03]} s={[0.14, 0.12, 0.02]} c="#0f172a" />
            <G p={[0, 0.04, hs / 2 + 0.03]} s={[0.06, 0.02, 0.02]} c="#39ff88" />
            <B p={[0, hs / 2 + 0.07, 0]} s={[hs + 0.16, 0.05, 0.08]} c="#111827" />{/* headphones */}
            <B p={[-hs / 2 - 0.05, 0, 0]} s={[0.07, 0.18, 0.18]} c="#111827" />
            <B p={[hs / 2 + 0.05, 0, 0]} s={[0.07, 0.18, 0.18]} c="#111827" />
          </>)}
          {kind === 'rugpull' && (<>
            <B p={[0, hs / 2 + 0.03, -0.01]} s={[hs + 0.02, 0.1, hs + 0.02]} c="#111827" />{/* slicked hair */}
            <B p={[0, 0.03, hs / 2 + 0.03]} s={[hs * 0.9, 0.1, 0.02]} c="#020617" />{/* shades */}
          </>)}
          {kind === 'guard' && <B p={[0, hs / 2 + 0.03, 0]} s={[hs + 0.04, 0.1, hs + 0.04]} c="#000000" />}
          {kind === 'bear' && (<>
            <B p={[0, 0, 0]} s={[hs + 0.04, hs, hs]} c="#a16207" />
            <B p={[-hs * 0.4, hs / 2 + 0.06, 0]} s={[0.14, 0.14, 0.1]} c="#78350f" />{/* ears */}
            <B p={[hs * 0.4, hs / 2 + 0.06, 0]} s={[0.14, 0.14, 0.1]} c="#78350f" />
            <B p={[0, -0.08, hs / 2 + 0.03]} s={[0.22, 0.16, 0.08]} c="#fde68a" />{/* snout */}
            <G p={[-hs * 0.22, 0.08, hs / 2 + 0.005]} s={[0.07, 0.07, 0.02]} c="#ff2d55" />
            <G p={[hs * 0.22, 0.08, hs / 2 + 0.005]} s={[0.07, 0.07, 0.02]} c="#ff2d55" />
          </>)}
          {kind === 'worker' && (<>
            <B p={[-hs / 2 - 0.04, 0, 0]} s={[0.06, 0.16, 0.14]} c="#0f172a" />{/* headset */}
            <B p={[-hs / 2 - 0.04, -0.12, 0.1]} s={[0.04, 0.04, 0.14]} c="#0f172a" />
          </>)}
        </group>

        {/* MeastMode aura (used by combat in later levels) */}
        <mesh ref={aura} visible={false} position={[0, 0.95, 0]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {showLabel && (
        <Html position={[0, 2.35, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="nametag">{label}</div>
        </Html>
      )}
      {kind === 'robofap' && (
        <Html position={[0, 2.8, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="loading-tag">&gt; loading...</div>
        </Html>
      )}
    </group>
  );
}
