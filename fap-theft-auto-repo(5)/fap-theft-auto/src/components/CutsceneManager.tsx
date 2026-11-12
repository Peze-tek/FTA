'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CUTSCENES, ROOFTOP, BOARD, cutsceneLength, type V3 } from '@/game/data/cutscenes';
import Character from '@/game/characters/Character';
import { BOX, toon, glow } from '@/game/materials';
import { useGame } from '@/lib/store';
import type { CharId } from '@/lib/types';
import RBox from '@/game/RBox';
import { sfx } from '@/lib/audio';

const ease = (t: number) => t * t * (3 - 2 * t);
const v = (a: V3) => new THREE.Vector3(...a);

/** Crew lined up on a rooftop platform (Level 1 finale). */
function RooftopStage() {
  const { x, y, z } = ROOFTOP;
  const line: { k: CharId; label: string; dx: number }[] = [
    { k: 'brandon', label: 'BRANDON', dx: -7.5 }, { k: 'pol', label: 'POL', dx: -4.8 },
    { k: 'robofap', label: 'ROBOFAP', dx: -2.3 }, { k: 'jake', label: 'JACK', dx: 0 },
    { k: 'paperhands', label: 'PAPER HANDS', dx: 2.3 }, { k: 'meast', label: 'MEAST', dx: 4.8 },
    { k: 'tek', label: 'TEK', dx: 7.5 },
  ];
  return (
    <group>
      <mesh geometry={BOX} material={toon('#2a2740')} position={[x, y - 0.5, z]} scale={[26, 1, 12]} />
      <mesh geometry={BOX} material={glow('#ff4fd8')} position={[x, y + 0.03, z + 6.05]} scale={[26, 0.08, 0.1]} />
      {[-1, 1].map((s) => <mesh key={s} geometry={BOX} material={glow('#22d3ee')} position={[x + s * 13, y + 0.4, z]} scale={[0.1, 0.9, 12]} />)}
      {/* railing */}
      <mesh geometry={BOX} material={toon('#14122a')} position={[x, y + 0.5, z - 6]} scale={[26, 1, 0.15]} />
      {line.map((c) => (
        <group key={c.k} position={[x + c.dx, y, z]} rotation-y={Math.sin(c.dx) * -0.15}>
          <Character kind={c.k} label={c.label} />
        </group>
      ))}
      <pointLight position={[x, y + 6, z + 4]} intensity={40} distance={30} color="#ffd1f0" />
    </group>
  );
}

/** Canvas texture for the boardroom's big LED screen. */
function pitchTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#12082a'); g.addColorStop(1, '#2a0a3a');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = '#ff4fd8'; x.lineWidth = 6; x.strokeRect(10, 10, 1004, 492);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ff2d55'; x.font = '900 34px Impact, "Arial Black", sans-serif'; x.fillText('CONFIDENTIAL · NEXT PROJECT', 512, 52);
  x.fillStyle = '#39ff88'; x.font = '900 110px Impact, "Arial Black", sans-serif'; x.fillText('$MOONSCAM', 512, 150);
  // rocket-ish price chart
  x.strokeStyle = '#39ff88'; x.lineWidth = 8; x.beginPath(); x.moveTo(90, 440);
  [[200, 410], [300, 420], [420, 350], [520, 360], [640, 270], [760, 280], [900, 200]].forEach(([a, b]) => x.lineTo(a, b));
  x.stroke();
  x.fillStyle = '#fff'; x.font = '700 30px "Arial Black", sans-serif'; x.textAlign = 'left';
  x.fillText('SUPPLY  1,000,000,000', 560, 330); x.fillText('TAX  30%  (trust us)', 560, 372);
  x.fillText('LIQUIDITY  "LOCKED"*', 560, 414); x.fillStyle = '#9ca3af'; x.font = '600 20px sans-serif'; x.fillText('*not locked', 560, 446);
  x.fillStyle = '#ffd23f'; x.font = '900 40px Impact, sans-serif'; x.fillText('100x', 90, 330);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

type Look = { top?: string; skin?: string; legs?: string; shoe?: string; w?: number; scale?: number };
/** Rugpull's private boardroom: sealed room, LED pitch screen, long table, KOLs + corporate guests (all fictional). */
function BoardroomStage() {
  const { x, y, z } = BOARD;
  const tex = useMemo(pitchTexture, []);
  const guests: { k: CharId; label: string; px: number; pz: number; look: Look }[] = [
    { k: 'og', label: 'KOL · MOONBOY', px: -2.7, pz: -1.8, look: { top: '#facc15', skin: '#a8754f', scale: 1.05 } },
    { k: 'worker', label: 'KOL · CRYPTO KAREN', px: -2.7, pz: 0.9, look: { top: '#ec4899', skin: '#e0ac69', legs: '#1e1b4b', scale: 1 } },
    { k: 'biker', label: 'MARKET MAKER', px: -2.7, pz: 3.6, look: { top: '#0ea5e9', skin: '#8d5524', scale: 1 } },
    { k: 'guard', label: 'EXCHANGE CEO', px: 2.7, pz: -1.8, look: { top: '#f8fafc', legs: '#0f172a', skin: '#c68642', scale: 1.1 } },
    { k: 'worker', label: 'VC FUND', px: 2.7, pz: 0.9, look: { top: '#1e3a8a', legs: '#1e3a8a', skin: '#e0b48a', scale: 1.05 } },
    { k: 'og', label: 'LAUNCHPAD', px: 2.7, pz: 3.6, look: { top: '#a855f7', skin: '#7a4a2a', scale: 1 } },
  ];
  return (
    <group position={[x, y, z]}>
      {/* shell */}
      <mesh geometry={BOX} material={toon('#17102a')} position={[0, -0.25, 3]} scale={[20, 0.5, 20]} />
      <mesh geometry={BOX} material={toon('#0f0a1e')} position={[0, 8.2, 3]} scale={[20, 0.4, 20]} />
      <mesh geometry={BOX} material={toon('#1b1233')} position={[0, 4, -7]} scale={[20, 8, 0.4]} />
      <mesh geometry={BOX} material={toon('#1b1233')} position={[-10, 4, 3]} scale={[0.4, 8, 20]} />
      <mesh geometry={BOX} material={toon('#1b1233')} position={[10, 4, 3]} scale={[0.4, 8, 20]} />
      <mesh geometry={BOX} material={toon('#1b1233')} position={[0, 4, 13]} scale={[20, 8, 0.4]} />
      {/* neon trim */}
      <mesh geometry={BOX} material={glow('#ff4fd8')} position={[0, 7.9, -6.75]} scale={[20, 0.12, 0.1]} />
      <mesh geometry={BOX} material={glow('#22d3ee')} position={[0, 0.12, -6.75]} scale={[20, 0.12, 0.1]} />
      {[-9.75, 9.75].map((sx) => <mesh key={sx} geometry={BOX} material={glow('#22d3ee')} position={[sx, 7.9, 3]} scale={[0.1, 0.12, 20]} />)}
      {[-1, 1].map((sx) => <mesh key={sx} geometry={BOX} material={glow('#ff4fd8')} position={[sx * 9.75, 0.12, 3]} scale={[0.1, 0.12, 20]} />)}
      {/* LED screen */}
      <mesh geometry={BOX} material={toon('#05030c')} position={[0, 4.2, -6.7]} scale={[11.4, 5.9, 0.2]} />
      <mesh position={[0, 4.2, -6.58]}><planeGeometry args={[11, 5.5]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      {/* floor glow under table */}
      <mesh position={[0, 0.02, 1]} rotation-x={-Math.PI / 2}><planeGeometry args={[7.4, 13]} /><meshBasicMaterial color="#ff4fd8" transparent opacity={0.1} depthWrite={false} toneMapped={false} /></mesh>
      {/* table */}
      <RBox size={[3.6, 0.22, 11]} maxR={0.08} material={toon('#241638')} position={[0, 1.0, 1.2]} />
      <mesh geometry={BOX} material={glow('#ff4fd8')} position={[0, 1.13, 1.2]} scale={[3.4, 0.03, 10.8]} />
      <mesh geometry={BOX} material={toon('#120a22')} position={[0, 0.5, 1.2]} scale={[1.2, 1, 9]} />
      {/* laptops, cash stacks, bottles on the table */}
      {guests.map((g, i) => (
        <group key={g.label} position={[g.px * 0.55, 1.14, g.pz]} rotation-y={g.px < 0 ? Math.PI / 2 : -Math.PI / 2}>
          <mesh geometry={BOX} material={toon('#94a3b8')} position={[0, 0.03, 0]} scale={[0.6, 0.05, 0.42]} />
          <mesh geometry={BOX} material={toon('#0f172a')} position={[0, 0.27, -0.2]} rotation-x={-0.25} scale={[0.6, 0.4, 0.04]} />
          <mesh geometry={BOX} material={glow(i % 2 ? '#22d3ee' : '#39ff88')} position={[0, 0.27, -0.18]} rotation-x={-0.25} scale={[0.52, 0.32, 0.01]} />
        </group>
      ))}
      {[[-0.4, 3.8], [0.5, 4.4], [-0.2, -2.3], [0.3, 2.2]].map(([cx, cz], i) => (
        <group key={i} position={[cx, 1.12, cz]}>
          <mesh geometry={BOX} material={toon('#16a34a')} position={[0, 0.1, 0]} scale={[0.42, 0.2, 0.2]} />
          <mesh geometry={BOX} material={toon('#15803d')} position={[0.05, 0.3, 0]} scale={[0.42, 0.2, 0.2]} />
          <mesh geometry={BOX} material={glow('#fde047')} position={[0, 0.41, 0]} scale={[0.1, 0.01, 0.2]} />
        </group>
      ))}
      {[-0.1, 0.35].map((bxp, i) => (
        <mesh key={i} material={toon('#14532d')} position={[bxp, 1.4, 1.4 + i * 1.5]}><cylinderGeometry args={[0.06, 0.07, 0.5, 14]} /></mesh>
      ))}
      {/* Rugpull at the head of the table, under the screen */}
      <group position={[0, 0, -4.4]}><Character kind="rugpull" label="RUGPULL" /></group>
      {/* guests facing the table */}
      {guests.map((g) => (
        <group key={g.label} position={[g.px, 0, g.pz]} rotation-y={g.px < 0 ? Math.PI / 2 : -Math.PI / 2}>
          <Character kind={g.k} label={g.label} look={g.look} />
        </group>
      ))}
      {/* two bodyguards by the door */}
      {[-1, 1].map((s) => <group key={s} position={[s * 8.4, 0, 10.5]} rotation-y={s * -0.5 + Math.PI}><Character kind="guard" /></group>)}
      <pointLight position={[0, 7, 1]} intensity={90} distance={26} color="#ffd1f0" />
      <pointLight position={[0, 4, -5]} intensity={55} distance={16} color="#c084fc" />
      <pointLight position={[0, 3, 9]} intensity={40} distance={18} color="#67e8f9" />
    </group>
  );
}

/** Plays a scripted camera dolly (shots w/ from/to/look/fov/caption) and then fires onDone. */
export default function CutsceneManager() {
  const cs = useGame((s) => s.cutscene);
  const { camera } = useThree();
  const t = useRef(0);
  const shot = useRef(-1);
  const def = cs ? CUTSCENES[cs.id] : null;

  useEffect(() => {
    t.current = 0; shot.current = -1;
    return () => {
      const c = camera as THREE.PerspectiveCamera;
      c.fov = 60; c.updateProjectionMatrix();
    };
  }, [cs?.id, camera]);

  useFrame((_, dtRaw) => {
    if (!def || !cs) return;
    t.current += Math.min(dtRaw, 0.05);
    let acc = 0, idx = 0;
    for (; idx < def.shots.length; idx++) { if (t.current < acc + def.shots[idx].dur) break; acc += def.shots[idx].dur; }
    if (idx >= def.shots.length) {
      if (t.current > cutsceneLength(cs.id) + 0.2) useGame.getState().endCutscene();
      return;
    }
    const sh = def.shots[idx];
    if (idx !== shot.current) {
      shot.current = idx; useGame.getState().setCaption(sh.caption ?? null);
      if (idx > 0) sfx.whoosh();                                  // every cut gets a transition swish
      for (const c of sh.sfx ?? []) { if (c === 'heartbeat') sfx.heartbeat(); else if (c === 'thunder') sfx.thunder(); else if (c === 'whoosh') sfx.whoosh(); else if (c === 'stinger') sfx.stinger(); else sfx[c](); }
    }
    const k = ease((t.current - acc) / sh.dur);
    camera.position.lerpVectors(v(sh.from), v(sh.to), k);
    camera.lookAt(v(sh.look).lerp(v(sh.lookTo ?? sh.look), k));
    const c = camera as THREE.PerspectiveCamera;
    const fov = THREE.MathUtils.lerp(sh.fov ?? 60, sh.fovTo ?? sh.fov ?? 60, k);
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  });

  return def?.stage === 'rooftop' ? <RooftopStage /> : def?.stage === 'boardroom' ? <BoardroomStage /> : null;
}
