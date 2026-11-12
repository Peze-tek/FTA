'use client';
/**
 * Rugpull's staff: suited-up employees roaming the sidewalks holding a placard that reads "WEN GEMPUMP?".
 * They pace back and forth, pause to wave the sign, and (Level 1) will chat if you walk up and press E. Harmless.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Character from '@/game/characters/Character';
import { BOX, toon } from '@/game/materials';
import { registerInteractable } from '@/lib/interact';
import { newAnim } from '@/lib/anim';
import { useGame } from '@/lib/store';
import { isDistrictUnlocked } from '@/lib/PriceSystem';

let signTex: THREE.CanvasTexture | null = null;
function getSignTexture() {
  if (signTex) return signTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f5f0e1'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#b91c1c'; x.lineWidth = 14; x.strokeRect(10, 10, 492, 236);
  x.fillStyle = '#b91c1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 92px Impact, "Arial Black", sans-serif'; x.fillText('WEN', 256, 78);
  x.font = '900 86px Impact, "Arial Black", sans-serif'; x.fillText('GEMPUMP?', 256, 172);
  signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 4;
  return signTex;
}

interface Walker { id: string; district: 1 | 2 | 3 | 4; x0: number; x1: number; z: number; startX: number; speed: number; look: { top: string; legs: string; skin: string; scale: number }; line: string }
const SUIT = '#1a1624';
const WALKERS: Walker[] = [
  { id: 's1', district: 1, x0: -45, x1: 30, z: 10.0, startX: -20, speed: 1.15, look: { top: '#7f1d1d', legs: SUIT, skin: '#8d5524', scale: 1 }, line: "Wen gempump? Boss says soon. Soon is a number, I'm told." },
  { id: 's2', district: 1, x0: -40, x1: 45, z: -10.0, startX: 25, speed: 1.0, look: { top: '#7f1d1d', legs: SUIT, skin: '#e0ac69', scale: 1.04 }, line: "I don't make the pumps. I just hold the sign. Pays 3 coins an hour." },
  { id: 's3', district: 2, x0: 58, x1: 140, z: 10.0, startX: 100, speed: 1.1, look: { top: '#991b1b', legs: SUIT, skin: '#a8754f', scale: 0.98 }, line: "Gempump is a mindset. Also a roadmap. Also, ask Rugpull." },
  { id: 's4', district: 2, x0: 60, x1: 142, z: -10.0, startX: 72, speed: 0.95, look: { top: '#7f1d1d', legs: SUIT, skin: '#c68642', scale: 1.02 }, line: "Wen gempump? Wen lambo? Wen salary? Nobody tells me anything." },
  { id: 's5', district: 3, x0: 158, x1: 240, z: 10.0, startX: 190, speed: 1.2, look: { top: '#7f1d1d', legs: SUIT, skin: '#7a4a2a', scale: 1 }, line: "My manager says the pump is 'in compliance review'. Wen gempump?" },
  { id: 's6', district: 3, x0: 160, x1: 245, z: -10.0, startX: 215, speed: 1.0, look: { top: '#991b1b', legs: SUIT, skin: '#b9835a', scale: 1.05 }, line: "They told me this job was 'on-chain'. It is a sign. On a stick." },
  { id: 's7', district: 4, x0: 262, x1: 345, z: 10.0, startX: 300, speed: 1.1, look: { top: '#7f1d1d', legs: SUIT, skin: '#8d5524', scale: 1 }, line: "Wen gempump? The exchange says Tuesday. Which Tuesday, they won't say." },
  { id: 's8', district: 4, x0: 262, x1: 345, z: -10.0, startX: 280, speed: 0.95, look: { top: '#991b1b', legs: SUIT, skin: '#e0b48a', scale: 1.02 }, line: "If you see Jack, don't tell him I'm on the payroll." },
];

function Staff({ w, interactive }: { w: Walker; interactive: boolean }) {
  const grp = useRef<THREE.Group>(null!);
  const sign = useRef<THREE.Group>(null!);
  const anim = useRef(newAnim());
  const st = useRef({ x: w.startX, dir: Math.random() < 0.5 ? 1 : -1, wait: Math.random() * 3, talk: 0, t: Math.random() * 6 });
  const tex = useMemo(getSignTexture, []);

  useEffect(() => {
    if (!interactive) return;
    return registerInteractable({
      id: w.id, x: w.startX, z: w.z, pos: () => ({ x: st.current.x, z: w.z }), radius: 2.4, label: 'Talk to staff',
      enabled: () => !useGame.getState().dialogue,
      onUse: () => { st.current.talk = 4; useGame.getState().say([{ who: 'RUGPULL STAFF', text: w.line, color: '#f87171' }]); },
    });
  }, [w, interactive]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), me = st.current, g = grp.current, a = anim.current;
    if (!g) return;
    me.t += dt; me.talk = Math.max(0, me.talk - dt);
    const idle = me.talk > 0 || me.wait > 0 || useGame.getState().dialogue;
    if (me.wait > 0 && me.talk <= 0) me.wait -= dt;
    if (!idle) {
      me.x += me.dir * w.speed * dt;
      if (me.x >= w.x1) { me.x = w.x1; me.dir = -1; me.wait = 2 + Math.random() * 3; }
      else if (me.x <= w.x0) { me.x = w.x0; me.dir = 1; me.wait = 2 + Math.random() * 3; }
      else if (Math.random() < dt * 0.04) me.wait = 2 + Math.random() * 3;
    }
    a.speed = idle ? 0 : 0.5;
    g.position.x = me.x; g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, me.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.15);
    // sign sways while walking, waved up and down while stopped
    if (sign.current) { sign.current.rotation.z = Math.sin(me.t * (idle ? 5 : 3)) * (idle ? 0.16 : 0.06); sign.current.position.y = 0.0 + (idle ? Math.abs(Math.sin(me.t * 5)) * 0.1 : 0); }
  });

  return (
    <group ref={grp} position={[w.startX, 0, w.z]} rotation-y={Math.PI / 2}>
      <Character kind="worker" look={w.look} anim={anim} label="RUG STAFF" />
      {/* placard held up beside the body: pole + double-sided sign facing the street */}
      <group ref={sign} position={[0.5, 0, 0.12]}>
        <mesh geometry={BOX} material={toon('#6b4f2a')} position={[0, 1.15, 0]} scale={[0.06, 2.3, 0.06]} />
        <group position={[0, 2.45, 0]}>
          <mesh rotation-y={Math.PI / 2} position={[0.035, 0, 0]}><planeGeometry args={[1.4, 0.7]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
          <mesh rotation-y={-Math.PI / 2} position={[-0.035, 0, 0]}><planeGeometry args={[1.4, 0.7]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
          <mesh geometry={BOX} material={toon('#2a1a0a')} scale={[0.05, 0.74, 1.44]} />
        </group>
      </group>
    </group>
  );
}

/** `openAll` (Survival / Free Play) shows every staffer; otherwise those in locked districts wait for the unlock. `interactive` = E to chat (needs an InteractionSystem). */
export default function RugStaff({ openAll = false, interactive = false }: { openAll?: boolean; interactive?: boolean }) {
  const peak = useGame((s) => s.peakPrice);
  const list = useMemo(() => WALKERS.filter((p) => openAll || isDistrictUnlocked(p.district, peak)), [openAll, peak]);
  return <>{list.map((p) => <Staff key={p.id} w={p} interactive={interactive} />)}</>;
}
