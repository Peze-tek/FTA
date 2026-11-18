'use client';
/**
 * Homeless NPCs, wrecked by Rugpull's rugs: some sit on the sidewalk corners wrapped in blankets next to a cardboard sign,
 * others shuffle slowly up and down the pavement. Walk up and press E to hear their story. Harmless.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import Character from '@/game/characters/Character';
import { BOX, toon, glow } from '@/game/materials';
import { registerInteractable } from '@/lib/interact';
import { newAnim } from '@/lib/anim';
import { useGame } from '@/lib/store';
import { isDistrictUnlocked } from '@/lib/PriceSystem';

interface Spot {
  id: string; district: 1 | 2 | 3 | 4; kind: 'sit' | 'roam';
  x: number; z: number; yaw?: number; x2?: number;     // roam: walks x -> x2 along z
  look: { top: string; legs?: string; skin: string; shoe?: string; scale?: number };
  lines: string[];
}
const SPOTS: Spot[] = [
  { id: 'h1', district: 1, kind: 'sit', x: -34, z: 10.3, yaw: Math.PI, look: { top: '#6b7280', skin: '#8d5524', scale: 1 },
    lines: ["I put my rent into Rugpull's last coin. Liquidity pulled the same night. Now this sidewalk is my penthouse.", 'Any spare change? Not FAPCOIN... real change.'] },
  { id: 'h2', district: 1, kind: 'sit', x: 12, z: -10.3, yaw: 0, look: { top: '#78716c', skin: '#a8754f', legs: '#44403c', scale: 0.98 },
    lines: ["Rugpull promised 100x. I got 0x and a 30% tax on my cardboard.", "Three rugs in one year. I'm diversified into cardboard now."] },
  { id: 'r1', district: 1, kind: 'roam', x: -40, x2: -6, z: -9.1, look: { top: '#57534e', legs: '#292524', skin: '#c68642', scale: 1.02 },
    lines: ["I ran a stall in Lagos Market. Rugpull rugged the whole street's savings. Never trust 'locked liquidity'.", "Jack, is it true you're going after him? Do it for all of us."] },
  { id: 'r2', district: 1, kind: 'roam', x: 18, x2: 46, z: 9.1, look: { top: '#a16207', legs: '#3f3a33', skin: '#7a4a2a', scale: 0.96 },
    lines: ["He took my house AND my seed phrase notebook. Walking is all I have left.", 'They say a green candle is coming. I stopped believing in candles.'] },
  { id: 'h3', district: 2, kind: 'sit', x: 80, z: -10.3, yaw: 0, look: { top: '#4b5563', legs: '#374151', skin: '#e0ac69', scale: 1 },
    lines: ["I was a KOL once. Shilled his coin to my whole family. They don't pick up my calls anymore.", "Don't get rugged twice. Once is a lesson. Twice is a lifestyle."] },
  { id: 'h4', district: 2, kind: 'sit', x: 118, z: 10.3, yaw: Math.PI, look: { top: '#854d0e', skin: '#8d5524', scale: 1.04 },
    lines: ["Paper hands sold me the dip. Rugpull sold me the top. Guess who bought both?", 'If you see Rugpull, tell him my cardboard has a better chart than his coin.'] },
  { id: 'r3', district: 2, kind: 'roam', x: 96, x2: 128, z: -9.1, look: { top: '#52525b', legs: '#27272a', skin: '#b9835a', scale: 1 },
    lines: ["I used to live in that penthouse tower. Now I live in its shadow.", 'Careful out here. The only thing Rugpull cannot rug is the sidewalk.'] },
];

function Person({ spot }: { spot: Spot }) {
  const grp = useRef<THREE.Group>(null!);
  const anim = useRef(newAnim());
  const st = useRef({ x: spot.x, dir: spot.x2! > spot.x ? 1 : -1, wait: 1 + Math.random() * 3, talk: 0, n: 0 });
  const sit = spot.kind === 'sit';

  useEffect(() => registerInteractable({
    id: spot.id, x: spot.x, z: spot.z, pos: () => ({ x: st.current.x, z: spot.z }), radius: 2.4, label: sit ? 'Talk' : 'Talk to the man',
    enabled: () => !useGame.getState().dialogue,
    onUse: () => {
      const s = useGame.getState(), me = st.current;
      const text = spot.lines[me.n++ % spot.lines.length];
      me.talk = 4;
      s.say([{ who: 'WRECKED BY RUGPULL', text, color: '#a8a29e' }]);
    },
  }), [spot, sit]);

  useFrame((_, dtRaw) => {
    if (sit) return;
    const dt = Math.min(dtRaw, 0.05), me = st.current, g = grp.current, a = anim.current;
    if (!g) return;
    me.talk = Math.max(0, me.talk - dt);
    if (me.talk > 0 || useGame.getState().dialogue) { a.speed = 0; return; }
    if (me.wait > 0) { me.wait -= dt; a.speed = 0; return; }
    const lo = Math.min(spot.x, spot.x2!), hi = Math.max(spot.x, spot.x2!);
    me.x += me.dir * 1.0 * dt;
    if (me.x >= hi) { me.x = hi; me.dir = -1; me.wait = 2 + Math.random() * 4; }
    else if (me.x <= lo) { me.x = lo; me.dir = 1; me.wait = 2 + Math.random() * 4; }
    else if (Math.random() < dt * 0.05) me.wait = 1.5 + Math.random() * 3;     // stops now and then
    a.speed = 0.32;
    g.position.x = me.x; g.rotation.y = me.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  if (sit) {
    return (
      <group position={[spot.x, 0, spot.z]} rotation-y={spot.yaw}>
        {/* sat on the kerb, legs under a blanket: body lowered into the mound */}
        <group position={[0, -0.5, 0]} rotation-x={-0.08}><Character kind="worker" look={spot.look} anim={anim} label="REKT" /></group>
        <mesh geometry={BOX} material={toon('#6b4f3a')} position={[0, 0.2, 0.45]} scale={[1.0, 0.4, 0.8]} />
        <mesh geometry={BOX} material={toon('#8b6f4e')} position={[0.1, 0.43, 0.5]} scale={[0.7, 0.06, 0.5]} />
        {/* cardboard sign + empty bottle */}
        <mesh geometry={BOX} material={toon('#c9a46a')} position={[-0.95, 0.38, 0.55]} rotation={[-0.25, 0.3, 0]} scale={[0.7, 0.5, 0.04]} />
        <mesh geometry={BOX} material={toon('#7c2d12')} position={[-0.95, 0.4, 0.58]} rotation={[-0.25, 0.3, 0]} scale={[0.5, 0.06, 0.02]} />
        <mesh position={[0.85, 0.16, 0.7]}><cylinderGeometry args={[0.07, 0.08, 0.32, 12]} /><meshStandardMaterial color="#14532d" /></mesh>
        <mesh geometry={BOX} material={glow('#ffb347')} position={[0.7, 0.04, 0.6]} scale={[0.14, 0.08, 0.14]} />
      </group>
    );
  }
  return (
    <group ref={grp} position={[spot.x, 0, spot.z]} rotation-y={Math.PI / 2}>
      <group rotation-x={0.14}><Character kind="worker" look={spot.look} anim={anim} label="REKT" /></group>
    </group>
  );
}

/** `openAll` shows everyone; otherwise people in locked districts wait behind the barricades. */
export default function Homeless({ openAll = false }: { openAll?: boolean }) {
  const peak = useGame((s) => s.peakPrice);
  const list = useMemo(() => SPOTS.filter((p) => openAll || isDistrictUnlocked(p.district, peak)), [openAll, peak]);
  return <>{list.map((p) => <Person key={p.id} spot={p} />)}</>;
}
