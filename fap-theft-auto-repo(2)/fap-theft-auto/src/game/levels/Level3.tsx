'use client';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import ThirdPersonController from '@/components/ThirdPersonController';
import Character from '@/game/characters/Character';
import { PlayerLight } from '@/game/world/Atmosphere';
import { BOX, glow, toon } from '@/game/materials';
import { boxFromCenter, registerColliders, resolveCircle } from '@/lib/colliders';
import { consume } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';
import { nav, clearNav, setNavTarget } from '@/lib/nav';
import {
  CombatWorld, makeFighter, MeastMode, updateMeastMode, newMeastModeState, meastModeLeft,
  type Fighter, type Vec,
} from '@/lib/CombatSystem';

const ARENA_R = 15;
const PILLARS: [number, number][] = [[-9, -4], [9, -4], [-9, 8], [9, 8]];
const BARRELS: [number, number][] = [[-12, 0], [12, 0], [0, -13], [-6, 12], [6, 12]];
const RAGE_MAX = 100;

/* ------------------------------------------------------------ visual helpers */
function FighterView({ f, label }: { f: Fighter; label?: string }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(() => {
    g.current.position.set(f.pos.x, 0, f.pos.z);
    g.current.rotation.y = f.yaw;
  });
  return <group ref={g}><Character kind={f.kind} anim={f.ref} label={label} /></group>;
}

interface Fx { life: number; x: number; z: number; max: number; r: number }
/** Pooled shockwave rings + hit sparks (no per-hit allocation). */
function Effects({ fx }: { fx: MutableRefObject<{ rings: Fx[]; sparks: Fx[] }> }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const { rings: R, sparks: S } = fx.current;
    for (let i = 0; i < 4; i++) {
      const m = rings.current[i]; if (!m) continue;
      const r = R[i];
      if (r && r.life > 0) {
        r.life -= dt; const k = 1 - Math.max(0, r.life) / r.max;
        m.visible = true; m.position.set(r.x, 0.12, r.z);
        m.scale.setScalar(Math.max(0.1, k * r.r));
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
      } else m.visible = false;
    }
    for (let i = 0; i < 8; i++) {
      const m = sparks.current[i]; if (!m) continue;
      const s = S[i];
      if (s && s.life > 0) {
        s.life -= dt; const k = s.life / s.max;
        m.visible = true; m.position.set(s.x, 1.2 + (1 - k) * 0.6, s.z); m.scale.setScalar(0.25 + (1 - k) * 0.8);
        (m.material as THREE.MeshBasicMaterial).opacity = k;
      } else m.visible = false;
    }
  });
  return (<>
    {[0, 1, 2, 3].map((i) => (
      <mesh key={'r' + i} ref={(m) => { rings.current[i] = m; }} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.85, 1, 32]} />
        <meshBasicMaterial color="#ffd24a" transparent opacity={0.8} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    ))}
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
      <mesh key={'s' + i} ref={(m) => { sparks.current[i] = m; }} visible={false}>
        <octahedronGeometry args={[0.5, 0]} />
        <meshBasicMaterial color="#fff3a0" transparent depthWrite={false} toneMapped={false} />
      </mesh>
    ))}
  </>);
}

function Arena() {
  return (
    <group>
      {/* asphalt + lane lines */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}><circleGeometry args={[40, 40]} /><meshStandardMaterial color="#1a1624" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}><ringGeometry args={[ARENA_R - 0.3, ARENA_R, 48]} /><meshBasicMaterial color="#ff2d55" toneMapped={false} /></mesh>
      {[-6, -2, 2, 6].map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.01, z * 2]}><planeGeometry args={[1.2, 3]} /><meshBasicMaterial color="#facc15" toneMapped={false} /></mesh>
      ))}
      {/* bridge deck overhead */}
      <mesh geometry={BOX} material={toon('#2a2438')} position={[0, 9, 2]} scale={[34, 1.6, 30]} />
      <mesh geometry={BOX} material={glow('#ff2d55')} position={[0, 8.15, 17.1]} scale={[34, 0.12, 0.12]} />
      {/* pillars */}
      {PILLARS.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh geometry={BOX} material={toon('#3b3350')} position={[0, 4.4, 0]} scale={[1.6, 8.8, 1.6]} />
          <mesh geometry={BOX} material={glow('#22d3ee')} position={[0, 1.2, 0.82]} scale={[1.0, 0.12, 0.02]} />
        </group>
      ))}
      {/* burning barrels */}
      {BARRELS.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh geometry={BOX} material={toon('#57534e')} position={[0, 0.45, 0]} scale={[0.8, 0.9, 0.8]} />
          <mesh geometry={BOX} material={glow('#ff7a18')} position={[0, 1.0, 0]} scale={[0.55, 0.35, 0.55]} />
        </group>
      ))}
      {/* red-candle / bear graffiti panels on the back wall */}
      {[-8, -2, 4, 10].map((x, i) => (
        <group key={x} position={[x, 3.2, -ARENA_R - 1]}>
          <mesh geometry={BOX} material={toon('#241a33')} scale={[4, 5, 0.3]} />
          <mesh geometry={BOX} material={glow(i % 2 ? '#ff2d55' : '#7f1d1d')} position={[0, -0.6 + i * 0.2, 0.2]} scale={[0.5, 1.8 + i * 0.5, 0.05]} />
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------- scene */
export default function Level3() {
  const world = useMemo(() => new CombatWorld(), []);
  const meastMode = useMemo(() => newMeastModeState(), []);
  const fx = useRef<{ rings: Fx[]; sparks: Fx[] }>({ rings: [], sparks: [] });
  const st = useRef({ started: false, rage: 0, ended: false, hudT: 0, lastRage: -1, idle: 0, hinted: 0 });

  const { jake, meast, bears } = useMemo(() => {
    const jake = makeFighter({ id: 'jake', label: 'JACK', team: 'heroes', kind: 'jake', isPlayer: true, hp: 100, maxHp: 100, radius: 0.45, damage: 9, threat: 0.55 });
    const meast = makeFighter({ id: 'meast', label: 'MEAST', team: 'heroes', kind: 'meast', hp: 240, maxHp: 240, radius: 0.8, reach: 2.6, speed: 3.6, damage: 6, windupTime: 0.4, cooldown: 1.0 });
    const mk = (id: string, label: string) => makeFighter({
      id, label, team: 'bears', kind: 'bear', hp: 150, maxHp: 150, radius: 0.95, reach: 2.4, speed: 2.5,
      damage: 15, windupTime: 0.65, cooldown: 1.3, armor: true, kbResist: 0.5,
    });
    const b1 = mk('bearA', 'BEAR TWIN · BULL'), b2 = mk('bearB', 'BEAR TWIN · BEAR');
    jake.pos.set(0, 0, 10); jake.yaw = Math.PI;
    meast.pos.set(-3, 0, 8); meast.yaw = Math.PI;
    b1.pos.set(-6, 0, -9); b2.pos.set(6, 0, -9);
    world.add(jake); world.add(meast); world.add(b1); world.add(b2);
    world.bounds = { x: 0, z: 0, r: ARENA_R };
    return { jake, meast, bears: [b1, b2] };
  }, [world]);

  const addRage = (n: number) => { st.current.rage = Math.min(RAGE_MAX, st.current.rage + n); };

  useEffect(() => registerColliders('l3', PILLARS.map(([x, z]) => boxFromCenter(x, z, 1.8, 1.8))), []);
  useEffect(() => {
    nav.range = 24;
    nav.rects = [
      { x: 0, z: 0, w: ARENA_R * 2, d: ARENA_R * 2, color: '#1d1726' },
      ...PILLARS.map(([x, z]) => ({ x, z, w: 1.8, d: 1.8, color: '#5a4b70' })),
    ];
    return () => clearNav();
  }, []);

  useEffect(() => {
    world.onSlam = (pos: Vec, radius: number) => {
      const r = fx.current.rings; const slot = r.findIndex((q) => q.life <= 0);
      const e = { life: 0.55, max: 0.55, x: pos.x, z: pos.z, r: radius * 1.05 };
      if (slot >= 0) r[slot] = e; else if (r.length < 4) r.push(e); else r[0] = e;
      haptic.impact('heavy'); sfx.slam();
    };
    world.onHit = (e) => {
      const S = fx.current.sparks; const spark = { life: 0.28, max: 0.28, x: e.target.pos.x, z: e.target.pos.z, r: 0 };
      const slot = S.findIndex((q) => q.life <= 0);
      if (slot >= 0) S[slot] = spark; else if (S.length < 8) S.push(spark); else S[0] = spark;
      if (e.blocked) { sfx.crash(); return; }
      if (e.attacker === jake) addRage(e.amount * 0.9);
      else if (e.attacker === meast) addRage(e.amount * 0.35);
      if (e.target === jake) { addRage(e.amount * 0.7); haptic.impact(e.big ? 'heavy' : 'medium'); }
    };
    const s = useGame.getState();
    s.setFight({ hp: jake.hp, maxHp: jake.maxHp, rage: 0, meastLeft: 0, ally: 1, foes: bears.map((b) => ({ id: b.id, name: b.label, hp: b.hp, max: b.maxHp })) });
    s.setObjective('Back Meast up! Punch the Bear Twins — keep Jack AND Meast alive');
    s.say([
      { who: 'BEAR TWIN · BULL', text: "Nice little pump you've got there, Jack. Shame if somebody... corrected it.", color: '#b45309' },
      { who: 'BEAR TWIN · BEAR', text: 'We short everything. Even your friends.', color: '#b45309' },
      { who: 'MEAST', text: "Two of them. I'll take the big one — you take whichever's left, Jack. Don't just stand there.", color: '#f59e0b' },
      { who: 'JACK', text: 'Hit hard, dodge their wind-ups (watch the red flash). Land punches to charge RAGE, then press Q — Meast goes MEAST MODE.', color: '#a78bfa' },
    ], () => { st.current.started = true; });
    return () => { world.onHit = undefined; world.onSlam = undefined; useGame.getState().setFight({ ...useGame.getState().fight, foes: [], meastLeft: 0, rage: 0 }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const S = st.current;
    if (g.cutscene || g.dialogue || g.minigame || g.gameOver || S.ended) return;
    jake.pos.set(playerState.pos.x, 0, playerState.pos.z);
    jake.yaw = playerState.facing;

    if (S.started) {
      // Q / MEAST button
      if (consume('special')) {
        if (S.rage >= RAGE_MAX && !meastMode.active && meast.hp > 0) {
          MeastMode(world, meast, meastMode);
          S.rage = 0;
          g.showBanner("I DON'T SHAKE. I MEAST.", 1800);
          haptic.notify('success');
        } else if (!meastMode.active) g.toast('RAGE not full yet — land punches!', 'info');
      }
      world.update(dt);
      updateMeastMode(world, meast, meastMode);
      // Jack knockback -> controller impulse
      playerState.impulse.x += jake.vel.x; playerState.impulse.z += jake.vel.z;
      jake.vel.set(0, 0, 0);
      for (const f of world.fighters) if (!f.isPlayer) resolveCircle(f.pos, f.radius * 0.6);
    }
    // keep Jack in the arena
    const d = Math.hypot(playerState.pos.x, playerState.pos.z);
    if (d > ARENA_R) { playerState.pos.x *= ARENA_R / d; playerState.pos.z *= ARENA_R / d; }

    // nav: markers + nearest-bear target
    nav.markers = bears.filter((b) => b.hp > 0).map((b) => ({ x: b.pos.x, z: b.pos.z, color: '#ff2d55', kind: 'enemy' as const }));
    const nb = world.nearestEnemy(jake);
    if (nb) setNavTarget(nb.pos.x, nb.pos.z, '#ff2d55', 'BEAR'); else nav.target = null;

    // HUD at ~10Hz
    S.hudT += dt;
    if (S.hudT > 0.1) {
      S.hudT = 0;
      g.setFight({
        hp: Math.ceil(jake.hp), maxHp: jake.maxHp, rage: Math.round(S.rage), meastLeft: Math.round(meastModeLeft(meastMode, world.time) * 10) / 10,
        ally: meast.hp / meast.maxHp,
        foes: bears.map((b) => ({ id: b.id, name: b.label, hp: Math.ceil(b.hp), max: b.maxHp })),
      });
    }

    // Jack must help: nag if he's not fighting, and lose if Meast gets overwhelmed
    if (S.started) {
      S.idle += dt;
      if (S.idle > 7 && world.time - S.hinted > 9) { S.hinted = world.time; S.idle = 3; g.toast('MEAST CAN\'T DO THIS ALONE — get in there, Jack!', 'bad'); }
    }
    // outcomes
    if (meast.hp <= 0 && jake.hp > 0 && bears.some((b) => b.hp > 0)) {
      S.ended = true; haptic.notify('error');
      setTimeout(() => useGame.getState().setGameOver('MEAST DOWN'), 900);
    } else if (jake.hp <= 0) {
      S.ended = true; jake.anim.dead = true; jake.anim.speed = 0; haptic.notify('error');
      setTimeout(() => useGame.getState().setGameOver('REKT'), 900);
    } else if (bears.every((b) => b.hp <= 0)) {
      S.ended = true; haptic.notify('success');
      g.setObjective('Bears down! Crack their short positions.');
      g.showBanner('BEAR TWINS DOWN', 2200);
      setTimeout(() => {
        const s = useGame.getState();
        if (s.screen !== 'game' || s.level !== 3) return;
        s.say([
          { who: 'MEAST', text: 'That all? I was just warming up.', color: '#f59e0b' },
          { who: 'ROBOFAP', text: 'Their shorts are liquidation-linked. Hit them in order of liquidation price and the whole stack cascades.', color: '#22d3ee' },
          { who: 'JACK', text: "Squeeze 'em. Cheapest liquidation first.", color: '#a78bfa' },
        ], () => useGame.getState().setMinigame('squeeze'));
      }, 1800);
    }
  });

  return (
    <>
      <color attach="background" args={['#0b0714']} />
      <PlayerLight />
      <pointLight position={[0, 6, -10]} color="#ff2d55" intensity={30} distance={26} />
      <Arena />
      <Effects fx={fx} />
      <FighterView f={meast} label="MEAST" />
      {bears.map((b) => <FighterView key={b.id} f={b} label={b.label} />)}
      <ThirdPersonController
        spawn={[0, 0, 10]} anim={jake.anim} camDistance={6.2} startYaw={0}
        canPunch
        onPunch={() => {
          if (!st.current.started || st.current.ended) return;
          jake.yaw = playerState.facing;
          st.current.idle = 0;
          world.punch(jake, 1, true);
        }}
      />
    </>
  );
}
