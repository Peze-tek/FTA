'use client';
/**
 * Drivable parked cars for any scene (Level 1 uses it). Walk up to a car and press E / tap the prompt to get in.
 * W/S (or GAS/REVERSE) + A/D steer, Shift = nitro, Space = handbrake, E = get out (when slow).
 * The scene must pass `driving={() => playerState.driving}` to ThirdPersonController so Jack hides and the camera is ours.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CarView from '@/game/world/CarView';
import { newDmg, hurtCar, crashDamage, type DmgCar } from '@/lib/carDamage';
import { registerInteractable } from '@/lib/interact';
import { consume, input } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { resolveCircle } from '@/lib/colliders';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { engine, sfx } from '@/lib/audio';

/** kind 0 = sports car, 1-4 = civilian looks (sedan / taxi / van / pickup) */
export interface CarDef { kind: number; color?: string; accent?: string; x: number; z: number; yaw: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
const KIND_LEN = [4.4, 4.0, 4.0, 4.6, 4.4];
interface Car extends DmgCar { id: number; def: CarDef; x: number; z: number; yaw: number; speed: number; len: number; g: THREE.Group | null }
const _cam = new THREE.Vector3();

export default function Vehicles({ cars: defs, bounds }: { cars: CarDef[]; bounds: Bounds }) {
  const cars = useMemo<Car[]>(() => defs.map((d, i) => ({ id: i, def: d, x: d.x, z: d.z, yaw: d.yaw, speed: 0, len: KIND_LEN[d.kind] ?? 4.2, g: null, ...newDmg() })), [defs]);
  const drv = useRef<Car | null>(null);
  const st = useRef({ camYaw: 0, brake: 0, shake: 0, crashCd: 0 });
  const { camera } = useThree();

  const enter = (c: Car) => {
    drv.current = c; playerState.driving = true; engine.start();
    st.current.camYaw = c.yaw; st.current.brake = 0;
    useGame.setState({ driving: true });
    sfx.pickup(); haptic.impact('medium');
  };
  const leave = (c: Car) => {
    const p = { x: c.x + Math.cos(c.yaw) * 2.5, z: c.z - Math.sin(c.yaw) * 2.5 };
    resolveCircle(p, 0.45);
    playerState.pos.set(p.x, 0, p.z);
    playerState.facing = c.yaw; playerState.yaw = c.yaw + Math.PI; playerState.vy = 0;
    drv.current = null; playerState.driving = false; c.speed = 0; engine.stop();
    useGame.setState({ driving: false }); useGame.getState().setPrompt(null); haptic.impact('light');
  };

  const blow = (c: Car) => {
    sfx.boom(); haptic.notify('error');
    st.current.shake = 1;
    useGame.getState().toast('CAR DESTROYED!', 'bad');
    if (drv.current === c) leave(c);
  };

  useEffect(() => {
    const offs = cars.map((c) => registerInteractable({
      id: `car${c.id}`, x: c.x, z: c.z, pos: () => ({ x: c.x, z: c.z }), radius: 3.4, label: 'DRIVE CAR',
      enabled: () => !playerState.driving && !c.wreck, onUse: () => enter(c),
    }));
    return () => {
      offs.forEach((o) => o());
      if (drv.current) { engine.stop(); playerState.driving = false; useGame.setState({ driving: false }); drv.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    for (const c of cars) if (c.g) { c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.yaw; }
    const c = drv.current;
    if (!c) return;
    const g = useGame.getState(), s = st.current;
    if (g.cutscene) { leave(c); return; }
    if (g.dialogue || g.minigame) return;

    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    const mx = clamp1(input.joyX + input.keyX), my = clamp1(input.keyY + (input.held.gas ? 1 : 0) - (input.held.rev ? 1 : 0));
    if (consume('jump') || consume('dodge')) s.brake = 0.7;
    consume('punch'); consume('grab'); consume('swap'); consume('special');
    s.brake = Math.max(0, s.brake - dt);
    const nitro = input.held.sprint && my > -0.1;
    const top = nitro ? 44 : 31, acc = nitro ? 26 : 16;
    if (my > 0.05) c.speed += (c.speed < top ? acc * my : 0) * dt;
    else if (my < -0.05) c.speed -= (c.speed > 0.4 ? 32 : 11) * -my * dt;
    else c.speed *= Math.exp(-0.45 * dt);
    if (s.brake > 0) c.speed *= Math.exp(-2.4 * dt);
    c.speed = Math.max(-9, Math.min(top + 2, c.speed));
    if (c.speed > top) c.speed -= (c.speed - top) * Math.min(1, 3 * dt);
    const grip = Math.min(1, Math.abs(c.speed) / 6) / (1 + Math.abs(c.speed) * 0.028);
    c.yaw += -mx * 2.1 * grip * (s.brake > 0 ? 1.5 : 1) * Math.sign(c.speed || 1) * dt;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    c.x += fx * c.speed * dt; c.z += fz * c.speed * dt;

    // walls / props: front and rear contact circles
    const off = c.len / 2 - 0.9;
    let pushX = 0, pushZ = 0;
    for (const sg of [1, -1]) {
      const p = { x: c.x + fx * off * sg, z: c.z + fz * off * sg }, bx = p.x, bz = p.z;
      resolveCircle(p, 1.0);
      pushX += p.x - bx; pushZ += p.z - bz;
    }
    c.x += pushX * 0.6; c.z += pushZ * 0.6;
    for (const o of cars) {            // other parked cars get shoved
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), min = 3.3;
      if (d >= min || d < 1e-3) continue;
      const k = (min - d) / d;
      o.x += dx * k * 0.7; o.z += dz * k * 0.7; c.x -= dx * k * 0.3; c.z -= dz * k * 0.3;
      pushX -= dx * k * 0.3; pushZ -= dz * k * 0.3;
      if (Math.abs(c.speed) > 9) { if (hurtCar(o, crashDamage(Math.abs(c.speed)) * 0.8)) blow(o); }
      resolveCircle(o, 1.3);
      o.yaw += Math.sin(c.yaw - o.yaw) * 0.02 * Math.abs(c.speed);
    }
    c.x = Math.max(bounds.minX, Math.min(bounds.maxX, c.x)); c.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, c.z));
    s.crashCd = Math.max(0, s.crashCd - dt);
    if (Math.hypot(pushX, pushZ) > 0.03) {
      const impact = Math.abs(c.speed);
      c.speed *= 0.45;
      if (s.crashCd <= 0) { const wasHp = c.hp; if (hurtCar(c, crashDamage(impact))) { blow(c); return; } if (wasHp >= 40 && c.hp < 40) g.toast('CAR SMOKING!', 'bad'); else if (wasHp >= 20 && c.hp < 20) g.toast('ABOUT TO BLOW — GET OUT!', 'bad'); }
      if (impact > 9 && s.crashCd <= 0) { s.crashCd = 0.5; s.shake = Math.min(1, impact / 30); sfx.crash(); haptic.impact('heavy'); }
      else if (s.crashCd <= 0) { s.crashCd = 0.25; sfx.bump(); }
    }

    // Jack rides along: orbs, interactables and the minimap all follow the car
    playerState.pos.set(c.x, 0, c.z); playerState.facing = c.yaw; playerState.yaw = c.yaw + Math.PI;
    playerState.moving = false; playerState.speed = 0; playerState.vy = 0; playerState.impulse.set(0, 0, 0);
    engine.set(Math.abs(c.speed), nitro && c.speed > 20);

    // exit prompt (tap it / E) — only when slow enough
    const want = Math.abs(c.speed) < 9 ? 'EXIT CAR' : null;
    if (g.prompt !== want) g.setPrompt(want);
    if (consume('interact')) { if (Math.abs(c.speed) < 9) { leave(c); return; } g.toast('Slow down to get out', 'info'); }

    // chase camera
    const trail = Math.min(1, Math.abs(c.speed) / 30);
    s.camYaw = THREE.MathUtils.damp(s.camYaw, c.yaw + (c.speed < -1 ? Math.PI : 0), 4, dt);
    const dist = 8.2 + trail * 2.4;
    s.shake = Math.max(0, s.shake - dt * 2.5);
    const tx = c.x - Math.sin(s.camYaw) * dist + (Math.random() - 0.5) * s.shake * 0.6;
    const tz = c.z - Math.cos(s.camYaw) * dist + (Math.random() - 0.5) * s.shake * 0.6;
    camera.position.lerp(_cam.set(tx, 3.4 + trail * 0.8, tz), 1 - Math.exp(-7 * dt));
    camera.lookAt(c.x + fx * 5, 1.2, c.z + fz * 5);
    const cam = camera as THREE.PerspectiveCamera, fov = 60 + (nitro && c.speed > 25 ? 12 : trail * 6);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.damp(cam.fov, fov, 5, dt); cam.updateProjectionMatrix(); }
  });

  return <>{cars.map((c) => <CarView key={c.id} car={c} />)}</>;
}
