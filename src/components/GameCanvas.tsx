'use client';
import { Suspense, useState, type ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useGame } from '@/lib/store';
import Atmosphere from '@/game/world/Atmosphere';
import { useQuality, QUALITY_INFO } from '@/lib/quality';
import type { AtmoId } from '@/lib/atmo';
import CutsceneManager from '@/components/CutsceneManager';
import Level1 from '@/game/levels/Level1';
import Level2 from '@/game/levels/Level2';
import Level3 from '@/game/levels/Level3';
import Level4 from '@/game/levels/Level4';
import Level5 from '@/game/levels/Level5';
import Survival from '@/game/levels/Survival';
import { useNeedsRotate } from '@/lib/orientation';
import FreePlay from '@/game/levels/FreePlay';

/** Level scenes. Levels 3-5 plug in here (see README roadmap). */
const LEVELS: Partial<Record<number, ComponentType>> = { 1: Level1, 2: Level2, 3: Level3, 4: Level4, 5: Level5 };

export default function GameCanvas() {
  const level = useGame((s) => s.level);
  const key = useGame((s) => s.levelKey);
  const quality = useQuality();
  const qi = QUALITY_INFO[quality];
  const cap = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, qi.dpr);
  const [dprDrop, setDprDrop] = useState(0);
  const dpr = Math.max(1, cap - dprDrop);
  const mode = useGame((s) => s.mode);
  const free = useGame((s) => s.free);
  const rotate = useNeedsRotate();
  const paused = useGame((s) => s.paused);
  // time of day: the open city + race road are daytime scenes; indoor / rooftop levels stay night
  const atmo: AtmoId = mode === 'survival' || level === 1 ? 'golden' : level === 4 ? 'day' : 'night';
  const Scene = mode === 'survival' ? (free ? FreePlay : Survival) : LEVELS[level];

  return (
    <div className="absolute inset-0">
      <Canvas
        key={quality}
        frameloop={rotate || paused ? 'never' : 'always'}
        dpr={dpr}
        shadows={qi.shadow > 0 ? (quality === 'high' ? 'soft' : 'percentage') : false}
        gl={{ antialias: qi.aa, powerPreference: 'high-performance', alpha: false }}
        camera={{ fov: 60, near: 0.1, far: 360, position: [0, 4, 10] }}
        onCreated={({ gl }) => gl.setClearColor('#0a0716')}
      >
        {/* adaptive resolution keeps 60fps on mid phones */}
        <PerformanceMonitor onDecline={() => setDprDrop((d) => Math.min(0.75, d + 0.25))} onIncline={() => setDprDrop((d) => Math.max(0, d - 0.25))} />
        <Atmosphere id={atmo} quality={quality} />
        <Suspense fallback={null}>{Scene ? <Scene key={`${mode}-${free}-${level}-${key}`} /> : null}</Suspense>
        <CutsceneManager />
      </Canvas>
      <div className="vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
