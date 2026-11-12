'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Character from '@/game/characters/Character';
import { consume, consumeLook, input, moveVec } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { resolveCircle } from '@/lib/colliders';
import { newAnim, type AnimState } from '@/lib/anim';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';

interface Props {
  spawn: [number, number, number];
  speed?: number;
  canPunch?: boolean;
  anim?: AnimState;
  camDistance?: number;
  onPunch?: () => void;
  /** When set, the camera/facing auto-locks to this point (boss fights, brawls). */
  lockTarget?: () => THREE.Vector3 | null;
  /** Face-only auto-aim (camera stays free like Level 1): while it returns a point the body turns toward it. */
  aimAt?: () => THREE.Vector3 | null;
  /** initial camera yaw (0 = looking down -Z, PI = looking down +Z) */
  startYaw?: number;
  /** clamp camera height (indoor levels) */
  camMaxY?: number;
  /** Free play: while true the player is in a vehicle; the controller hides Jack and leaves camera + position alone. */
  driving?: () => boolean;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _des = new THREE.Vector3();
const _look = new THREE.Vector3();
const angLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * GTA-style over-the-shoulder controller.
 * Camera-relative movement, orbit look (drag / pointer lock / touch pad), circle-vs-AABB collisions,
 * jump, punch with cooldown, optional lock-on.
 */
export default function ThirdPersonController({
  spawn, speed = 5.4, canPunch = true, anim, camDistance = 4.6, onPunch, lockTarget, aimAt, startYaw = 0, camMaxY, driving,
}: Props) {
  const group = useRef<THREE.Group>(null!);
  const animRef = useRef<AnimState>(anim ?? newAnim());
  const yaw = useRef(0);
  const pitch = useRef(0.28);
  const face = useRef(0);
  const cd = useRef(0);
  const warn = useRef(0);
  const stepT = useRef(0);
  const wasDriving = useRef(false);
  const { camera } = useThree();

  useEffect(() => {
    playerState.pos.set(...spawn);
    playerState.vy = 0;
    playerState.impulse.set(0, 0, 0);
    group.current.position.set(...spawn);
    yaw.current = startYaw;
    face.current = startYaw + Math.PI;
    camera.position.set(spawn[0] + Math.sin(startYaw) * camDistance, spawn[1] + 3.5, spawn[2] + Math.cos(startYaw) * camDistance);
    (camera as THREE.PerspectiveCamera).fov = 60;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGame.getState();
    if (s.cutscene) return; // CutsceneManager owns the camera
    if (driving?.()) {
      group.current.visible = false; consumeLook(); wasDriving.current = true;
      return;
    }
    group.current.visible = true;
    if (wasDriving.current) {            // just stepped out: face + camera pick up where the car was heading
      wasDriving.current = false;
      yaw.current = playerState.yaw; face.current = playerState.facing;
      playerState.vy = 0; animRef.current.speed = 0;
      camera.position.set(playerState.pos.x + Math.sin(yaw.current) * camDistance, 3.5, playerState.pos.z + Math.cos(yaw.current) * camDistance);
    }
    const frozen = !!(s.dialogue || s.minigame || s.gameOver || playerState.locked);
    const a = animRef.current;
    const pos = playerState.pos;

    const look = consumeLook();
    if (!frozen && !lockTarget) {
      yaw.current -= look.x * 0.0028;
      pitch.current = THREE.MathUtils.clamp(pitch.current + look.y * 0.0022, -0.1, 1.05);
    }
    if (lockTarget) {
      const t = lockTarget();
      if (t) yaw.current = angLerp(yaw.current, Math.atan2(pos.x - t.x, pos.z - t.z), 1 - Math.exp(-6 * dt));
    }

    // basis vectors from camera yaw (yaw 0 => looking down -Z)
    _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    _right.set(Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    // ---- movement
    let moving = false;
    let vx = 0, vz = 0;
    if (!frozen) {
      const m = moveVec();
      if (m.mag > 0.06) {
        const crouch = input.held.crouch;
        const run = (input.held.sprint || m.mag > 0.85) && !crouch;
        const sp = speed * (crouch ? 0.5 : run ? 1.3 : 0.85) * Math.min(1, m.mag * 1.15);
        vx = (_fwd.x * m.y + _right.x * m.x) * sp;
        vz = (_fwd.z * m.y + _right.z * m.x) * sp;
        moving = true;
        a.speed = THREE.MathUtils.lerp(a.speed, crouch ? 0.4 : run ? 1 : 0.7, 0.2);
        playerState.speed = sp;
        if (!lockTarget) face.current = angLerp(face.current, Math.atan2(vx, vz), 1 - Math.exp(-14 * dt));
      }
      a.crouch = input.held.crouch;
      playerState.crouching = a.crouch;
    }
    if (!moving) { a.speed = THREE.MathUtils.lerp(a.speed, 0, 0.25); playerState.speed = 0; }
    if (lockTarget) {
      const t = lockTarget();
      if (t) face.current = angLerp(face.current, Math.atan2(t.x - pos.x, t.z - pos.z), 1 - Math.exp(-14 * dt));
    } else if (aimAt) {
      const t = aimAt();
      if (t) face.current = angLerp(face.current, Math.atan2(t.x - pos.x, t.z - pos.z), 1 - Math.exp(-18 * dt));
    }
    playerState.moving = moving;
    if (moving && playerState.grounded && !frozen) {
      stepT.current -= dt * (playerState.speed / 5);
      if (stepT.current <= 0) { stepT.current = 0.42; sfx.step(); }
    }

    pos.x += vx * dt + playerState.impulse.x * dt;
    pos.z += vz * dt + playerState.impulse.z * dt;
    playerState.impulse.multiplyScalar(Math.pow(0.88, dt * 60));

    // jump / gravity
    if (!frozen && consume('jump') && playerState.grounded) { playerState.vy = 6.2; playerState.grounded = false; sfx.jump(); }
    playerState.vy -= 18 * dt;
    pos.y += playerState.vy * dt;
    if (pos.y <= 0) { if (!playerState.grounded && playerState.vy < -4) sfx.land(); pos.y = 0; playerState.vy = 0; playerState.grounded = true; }

    resolveCircle(pos, 0.4);

    // ---- punch
    cd.current = Math.max(0, cd.current - dt);
    if (consume('punch') && !frozen) {
      if (s.noViolence) {
        if (performance.now() - warn.current > 2500) { warn.current = performance.now(); s.toast('NO VIOLENCE — they\'re just workers on a night shift', 'info'); }
      } else if (canPunch && cd.current <= 0) {
        cd.current = 0.32; a.punch = 1; onPunch?.(); haptic.impact('light'); sfx.punch();
      }
    }

    // ---- apply to mesh
    group.current.position.copy(pos);
    group.current.rotation.y = face.current;
    playerState.facing = face.current;
    playerState.yaw = yaw.current;

    // ---- over-the-shoulder camera
    const p = pitch.current;
    _tgt.set(pos.x, pos.y + 1.55, pos.z).addScaledVector(_right, lockTarget ? 0.3 : 0.75);
    _des.set(
      _tgt.x + Math.sin(yaw.current) * Math.cos(p) * camDistance,
      _tgt.y + Math.sin(p) * camDistance,
      _tgt.z + Math.cos(yaw.current) * Math.cos(p) * camDistance,
    );
    if (_des.y < 0.5) _des.y = 0.5;
    if (camMaxY !== undefined && _des.y > camMaxY) _des.y = camMaxY;
    camera.position.lerp(_des, 1 - Math.exp(-12 * dt));
    _look.copy(_tgt).addScaledVector(_fwd, 3);
    camera.lookAt(_look);
  });

  return (
    <group ref={group}>
      <Character kind="jake" anim={animRef} />
    </group>
  );
}
