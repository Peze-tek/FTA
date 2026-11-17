/** Shared car damage model (Free Play + Level 1 cars). */
export interface DmgCar {
  hp: number;      // 0..CAR_HP
  dent: number;    // 0..1 visual crumple
  wreck: boolean;  // burnt out: can't be driven
  boom: number;    // 1 -> 0 explosion flash timer
  speed: number;
}
export const CAR_HP = 100;
export const newDmg = () => ({ hp: CAR_HP, dent: 0, wreck: false, boom: 0 });

/** Apply damage. Returns true on the hit that destroys the car (caller handles the blast). */
export function hurtCar(c: DmgCar, dmg: number): boolean {
  if (c.wreck || dmg <= 0) return false;
  c.hp = Math.max(0, c.hp - dmg);
  c.dent = Math.min(1, c.dent + dmg / 70);
  if (c.hp <= 0) { c.wreck = true; c.boom = 1; c.speed = 0; return true; }
  return false;
}
/** Damage from hitting something at `impact` m/s (gentle bumps are free). */
export const crashDamage = (impact: number) => (impact > 8 ? (impact - 8) * 1.7 : 0);
export const BLAST_RADIUS = 7;
