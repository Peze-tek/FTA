import { Vector3 } from 'three';

/** Mutable, non-reactive snapshot of Jack. Systems read it every frame. */
export const playerState = {
  pos: new Vector3(),
  impulse: new Vector3(), // knockback applied by combat (later levels)
  yaw: 0,
  facing: 0,
  speed: 0,
  moving: false,
  crouching: false,
  vy: 0,
  grounded: true,
  driving: false, // true while in a vehicle (Level 1 / Free Play): hides Jack, scene owns position + camera
  locked: false, // true while grabbed / in a scripted moment: controller ignores input
};
