/** Per-character animation flags. Mutated by controllers/combat, read by <Character/> each frame. */
export interface AnimState {
  speed: number;   // 0..1 walk/run amount
  punch: number;   // 1 -> 0 swing
  hit: number;     // 1 -> 0 flinch
  slam: number;
  special: number; // >0 shows aura (MeastMode later)
  windup: number;
  crouch: boolean;
  dead: boolean;
}
export const newAnim = (): AnimState => ({
  speed: 0, punch: 0, hit: 0, slam: 0, special: 0, windup: 0, crouch: false, dead: false,
});
