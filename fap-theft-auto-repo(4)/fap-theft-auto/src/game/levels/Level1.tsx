'use client';
import StreetMascot from '@/game/world/StreetMascot';
import Homeless from '@/game/world/Homeless';
import RugStaff from '@/game/world/RugStaff';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Detailed } from '@react-three/drei';
import * as THREE from 'three';
import City from '@/game/world/City';
import Vehicles, { type CarDef } from '@/game/world/Vehicles';
import { PlayerLight, FogLayers } from '@/game/world/Atmosphere';
import Character from '@/game/characters/Character';
import ThirdPersonController from '@/components/ThirdPersonController';
import { InteractionSystem, registerInteractable } from '@/lib/interact';
import { useGame } from '@/lib/store';
import { playerState } from '@/lib/playerState';
import { BOX, toon, glow } from '@/game/materials';
import { CALL_CENTER, LAPTOP_POS, RECRUIT_QUESTS, type RecruitQuest } from '@/game/data/quests';
import { CREW_INFO, type CrewId } from '@/lib/types';
import { haptic } from '@/lib/telegram';
import { isDistrictUnlocked } from '@/lib/PriceSystem';
import { nav, clearNav, type NavRect } from '@/lib/nav';
import { DISTRICTS, ROUTES, WORLD, rowZ } from '@/game/data/districts';

/** Drivable cars parked along the streets (E to get in). */
const L1_CARS: CarDef[] = [
  { kind: 0, color: '#ff2d55', accent: '#ffd24a', x: -40, z: -4, yaw: Math.PI / 2 },
  { kind: 1, x: -12, z: 3.8, yaw: -Math.PI / 2 },
  { kind: 0, color: '#22d3ee', accent: '#39ff88', x: 36, z: 3.8, yaw: Math.PI / 2 },
  { kind: 2, x: 70, z: -3.8, yaw: Math.PI / 2 },
  { kind: 0, color: '#facc15', accent: '#111111', x: 112, z: -4, yaw: Math.PI / 2 },
  { kind: 4, x: 146, z: 3.8, yaw: Math.PI / 2 },
  { kind: 3, x: 172, z: -3.6, yaw: -Math.PI / 2 },
  { kind: 0, color: '#a855f7', accent: '#22d3ee', x: 214, z: 3.8, yaw: Math.PI / 2 },
  { kind: 1, x: 250, z: -3.8, yaw: Math.PI / 2 },
  { kind: 0, color: '#f97316', accent: '#0f172a', x: 288, z: 3.8, yaw: -Math.PI / 2 },
  { kind: 2, x: 326, z: -3.8, yaw: Math.PI / 2 },
  { kind: 0, color: '#ec4899', accent: '#111111', x: -25, z: -30, yaw: Math.PI },
  { kind: 3, x: 85, z: 34, yaw: 0 },
  { kind: 0, color: '#38bdf8', accent: '#facc15', x: 135, z: -32, yaw: Math.PI },
  { kind: 4, x: 165, z: 36, yaw: 0 },
  { kind: 2, x: 235, z: -30, yaw: Math.PI },
];
const L1_BOUNDS = { minX: WORLD.minX + 4, maxX: WORLD.maxX - 4, minZ: -(WORLD.halfZ - 3), maxZ: WORLD.halfZ - 3 };

/* ------------------------------------------------------------ NPC + props */
function Npc({ q }: { q: RecruitQuest }) {
  const info = CREW_INFO[q.npc];
  const recruited = useGame((s) => s.crew[q.npc]);
  useEffect(() => registerInteractable({
    id: `npc-${q.npc}`, x: q.npcPos[0], z: q.npcPos[2], radius: 3,
    label: `Talk to ${info.name}`, onUse: () => talk(q.npc),
  }), [q, info.name]);
  return (
    <group position={q.npcPos} rotation-y={q.facing}>
      <Detailed distances={[0, 45]}>
        <Character kind={q.npc} label={recruited ? `${info.name} ✓` : info.name} />
        <mesh geometry={BOX} material={toon(info.color)} position={[0, 0.9, 0]} scale={[0.6, 1.8, 0.4]} />
      </Detailed>
    </group>
  );
}

/** Dialogue + recruit flow for an NPC. Enforces the locked Brandon > Pol > Robofap > Paper Hands > Meast > Tek order. */
function talk(id: CrewId) {
  const s = useGame.getState();
  const name = CREW_INFO[id].name;
  const color = CREW_INFO[id].color;
  const cur = RECRUIT_QUESTS[s.questIndex];
  if (s.crew[id]) { s.say([{ who: name, text: 'We ride when the candles go green. Go go go!', color }]); return; }
  if (!cur || cur.npc !== id) {
    s.say([{ who: name, text: 'Not yet. Recruit the crew in order: Brandon, Pol, Robofap, Paper Hands, Meast, then Tek.', color }]);
    return;
  }
  if (s.questStep !== 'talk') { s.say([{ who: name, text: cur.reminder, color }]); return; }
  s.say(cur.lines, () => {
    const st = useGame.getState();
    st.recruit(cur.npc, cur.pumpTo);
    st.toast(`${name} joined the crew!`, 'good');
    haptic.notify('success');
    st.nextQuest();
    if (useGame.getState().questIndex >= RECRUIT_QUESTS.length) {
      useGame.setState({ questStep: 'done' });
      st.playCutscene('rooftop', () => useGame.getState().completeLevel(1));
    }
  });
}

function Laptop() {
  const introDone = useGame((s) => s.introDone);
  const g = useRef<THREE.Group>(null!);
  useEffect(() => registerInteractable({
    id: 'laptop', x: LAPTOP_POS[0], z: LAPTOP_POS[2], radius: 2.6, label: "Open Shitoshi's laptop",
    enabled: () => !useGame.getState().introDone,
    onUse: () => useGame.getState().playCutscene('intro', () => {
      const s = useGame.getState();
      s.setIntroDone();
      s.toast('Mission: recruit the crew. First stop — find Brandon. Follow the marker: he is down a back alley.', 'info');
    }),
  }), []);
  useFrame(({ clock }) => { if (g.current && !introDone) g.current.position.y = 0.05 * Math.sin(clock.elapsedTime * 2); });
  return (
    <group position={LAPTOP_POS}>
      <group ref={g}>
        <mesh geometry={BOX} material={toon('#94a3b8')} position={[0, 0.32, 0]} scale={[0.9, 0.06, 0.6]} />
        <mesh geometry={BOX} material={toon('#0f172a')} position={[0, 0.66, -0.28]} rotation-x={-0.25} scale={[0.9, 0.6, 0.05]} />
        <mesh geometry={BOX} material={glow('#39ff88')} position={[0, 0.66, -0.25]} rotation-x={-0.25} scale={[0.8, 0.5, 0.02]} />
      </group>
      {!introDone && (
        <mesh position={[0, 6, 0]} geometry={BOX} scale={[0.5, 12, 0.5]}>
          <meshBasicMaterial color="#39ff88" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------- quest orbs */
function Orbs({ q }: { q: RecruitQuest }) {
  const step = useGame((s) => s.questStep);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const got = useRef<boolean[]>([]);
  useEffect(() => { got.current = q.orbs.map(() => false); refs.current.forEach((m) => m && (m.visible = true)); }, [q]);
  useFrame(({ clock }) => {
    if (step !== 'orbs') return;
    const p = playerState.pos;
    q.orbs.forEach(([x, z], i) => {
      const m = refs.current[i];
      if (!m || got.current[i]) return;
      m.rotation.y = clock.elapsedTime * 2;
      m.position.y = 1.2 + Math.sin(clock.elapsedTime * 3 + i) * 0.15;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 1.8 * 1.8) {
        got.current[i] = true; m.visible = false;
        const s = useGame.getState();
        s.addOrb(); haptic.impact('medium');
        const n = useGame.getState().orbsGot;
        if (n >= q.orbs.length) { s.setQuestStep('talk'); s.toast('Done! Go talk to ' + CREW_INFO[q.npc].name, 'good'); haptic.notify('success'); }
      }
    });
  });
  if (step !== 'orbs') return null;
  return (<>
    {q.orbs.map(([x, z], i) => (
      <group key={i} position={[x, 0, z]}>
        <mesh ref={(m) => { refs.current[i] = m; }} position={[0, 1.2, 0]}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshBasicMaterial color={CREW_INFO[q.npc].color} toneMapped={false} />
        </mesh>
        <mesh position={[0, 4, 0]} geometry={BOX} scale={[0.25, 8, 0.25]}>
          <meshBasicMaterial color={CREW_INFO[q.npc].color} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    ))}
  </>);
}

/* ------------------------------------------------ Tek: AI call center zone */
function CallCenter() {
  const step = useGame((s) => s.questStep);
  const idx = useGame((s) => s.questIndex);
  const active = idx === 5 && step === 'infiltrate';
  const unlocked = useGame((s) => isDistrictUnlocked(3, s.peakPrice));
  useEffect(() => registerInteractable({
    id: 'callcenter', x: CALL_CENTER.x, z: CALL_CENTER.z, radius: 3.4, label: 'Infiltrate AI Call Center',
    enabled: () => { const s = useGame.getState(); return s.questIndex === 5 && s.questStep === 'infiltrate'; },
    onUse: () => useGame.getState().setMinigame('hack'),
  }), []);
  // workers are non-violent NPCs: punching is disabled around them
  const near = useRef(false);
  useFrame(() => {
    const d2 = (playerState.pos.x - CALL_CENTER.x) ** 2 + (playerState.pos.z - CALL_CENTER.z) ** 2;
    const n = d2 < 18 * 18;
    if (n !== near.current) { near.current = n; useGame.getState().setNoViolence(n); }
  });
  useEffect(() => () => useGame.getState().setNoViolence(false), []);
  if (!unlocked) return null;
  return (<>
    {[-5, -1.7, 1.7, 5].map((dx, i) => (
      <group key={i} position={[CALL_CENTER.x + dx, 0, CALL_CENTER.z - 1.5]}>
        <Character kind="worker" label={i === 0 ? 'CALL CENTER STAFF' : undefined} />
      </group>
    ))}
    {active && (
      <mesh position={[CALL_CENTER.x, 6, CALL_CENTER.z]} geometry={BOX} scale={[0.6, 12, 0.6]}>
        <meshBasicMaterial color="#ff2d55" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    )}
  </>);
}

/* ------------------------------------------------------ objective + beacon */
function Beacon({ pos, color }: { pos: [number, number]; color: string }) {
  const m = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { m.current.scale.x = m.current.scale.z = 1 + Math.sin(clock.elapsedTime * 3) * 0.15; });
  return (
    <mesh ref={m} position={[pos[0], 15, pos[1]]}>
      <cylinderGeometry args={[0.5, 0.5, 30, 8, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} />
    </mesh>
  );
}

function QuestDirector() {
  const idx = useGame((s) => s.questIndex);
  const step = useGame((s) => s.questStep);
  const got = useGame((s) => s.orbsGot);
  const intro = useGame((s) => s.introDone);
  useEffect(() => {
    const s = useGame.getState();
    const q = RECRUIT_QUESTS[idx];
    if (!intro) s.setObjective("Open Shitoshi's laptop (glowing)");
    else if (!q || step === 'done') s.setObjective('Rooftop meeting...');
    else if (step === 'orbs') s.setObjective(`${q.orbLabel} (${got}/${q.orbs.length}) — ${idx + 1}/6 recruits`);
    else if (step === 'infiltrate') s.setObjective(`${q.orbLabel} — hack the voice clone, NO violence`);
    else s.setObjective(q.objectiveTalk);
  }, [idx, step, got, intro]);

  const q = RECRUIT_QUESTS[idx];
  let beacon: [number, number] | null = null;
  let color = '#39ff88';
  if (!intro) beacon = [LAPTOP_POS[0], LAPTOP_POS[2]];
  else if (q && step === 'orbs') { beacon = [q.orbs[Math.min(got, q.orbs.length - 1)][0], q.orbs[Math.min(got, q.orbs.length - 1)][1]]; color = CREW_INFO[q.npc].color; }
  else if (q && step === 'infiltrate') { beacon = [CALL_CENTER.x, CALL_CENTER.z]; color = '#ff2d55'; }
  else if (q && step === 'talk') { beacon = [q.npcPos[0], q.npcPos[2]]; color = CREW_INFO[q.npc].color; }
  const label = !intro ? "Shitoshi's laptop"
    : q && step === 'orbs' ? q.orbLabel.replace(/^Collect /, '')
    : q && step === 'infiltrate' ? 'AI Call Center'
    : q ? CREW_INFO[q.npc].name : '';
  const bx = beacon ? beacon[0] : 0, bz = beacon ? beacon[1] : 0, has = !!beacon;
  // feed the minimap's objective guide
  useEffect(() => {
    nav.target = has ? { x: bx, z: bz, color, label } : null;
    return () => { nav.target = null; };
  }, [has, bx, bz, color, label]);
  return beacon ? <Beacon pos={beacon} color={color} /> : null;
}

/* ------------------------------------------------------------------- level */
let openingShownAt = 0;   // levelIntro stamp of the run that already played the boardroom opening
export default function Level1() {
  const idx = useGame((s) => s.questIndex);
  const peak = useGame((s) => s.peakPrice);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  // opening: Rugpull pitches his next rug to KOLs + big corporations (new game only; SKIP button in the HUD)
  useEffect(() => {
    const s = useGame.getState();
    if (s.questStep !== 'intro' || s.introDone || s.levelIntro === openingShownAt) return;
    openingShownAt = s.levelIntro;
    const t = setTimeout(() => useGame.getState().playCutscene('boardroom'), 600);
    return () => clearTimeout(t);
  }, []);
  const q = RECRUIT_QUESTS[idx];

  // minimap layout: road, building bands, landmarks, locked-district barricades
  useEffect(() => {
    nav.range = 55;
    const rects: NavRect[] = [{ x: 150, z: 0, w: 410, d: 16, color: '#46445c' }];
    DISTRICTS.forEach((d) => {
      [-1, 1].forEach((sd) => rects.push({ x: d.cx, z: sd * 58, w: 100, d: 68, color: '#2b2547', district: d.id }));
      d.landmarks.forEach((l) => rects.push({ x: l.pos[0], z: l.pos[1], w: l.size[0], d: l.size[2], color: l.neon, district: d.id }));
      if (d.id > 1) rects.push({ x: d.cx - 50, z: 0, w: 2.5, d: 50, color: '#ff2d55', district: d.id, lockedOnly: true });
    });
    ROUTES.forEach((q) => {      // side streets + alleys carved out of the building blocks
      const za = rowZ(q.row, q.dir), x0 = Math.min(q.sx, q.ax) - 5, x1 = Math.max(q.sx, q.ax) + 5;
      rects.push({ x: q.sx, z: (q.dir * 12 + za) / 2, w: 10, d: Math.abs(za - q.dir * 12) + 5, color: '#46445c', district: q.district });
      rects.push({ x: (x0 + x1) / 2, z: za, w: x1 - x0, d: 10, color: '#46445c', district: q.district });
    });
    nav.rects = rects;
    return () => clearNav();
  }, []);
  // crew members as dots once their district is open
  useEffect(() => {
    nav.markers = RECRUIT_QUESTS.filter((r) => isDistrictUnlocked(r.district, peak))
      .map((r) => ({ x: r.npcPos[0], z: r.npcPos[2], color: CREW_INFO[r.npc].color, kind: 'poi' as const }));
  }, [peak]);

  // spawn: start of the game near the laptop; resumed saves drop you by the current quest giver
  const route = q ? ROUTES.find((r) => r.id === q.npc) : undefined;
  const spawn: [number, number, number] = idx > 0 && q ? (route ? [route.sx, 0, route.dir * 3] : [q.npcPos[0] - 4, 0, q.npcPos[2] > 0 ? 3 : -3]) : [0, 0, 4];
  return (
    <>
      <City routes />
      <PlayerLight />
      <FogLayers />
      {ready && <ThirdPersonController spawn={spawn} canPunch driving={() => playerState.driving} />}
      <Vehicles cars={L1_CARS} bounds={L1_BOUNDS} />
      <Laptop />
      {RECRUIT_QUESTS.filter((r) => isDistrictUnlocked(r.district, peak)).map((r) => <Npc key={r.npc} q={r} />)}
      {q && <Orbs q={q} />}
      <CallCenter />
      <StreetMascot />
      <Homeless />
      <RugStaff interactive />
      <QuestDirector />
      <InteractionSystem />
    </>
  );
}
