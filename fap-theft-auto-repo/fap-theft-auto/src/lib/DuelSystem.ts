/**
 * DuelSystem — Level 5 boss logic: Jack vs RUGPULL in three phases.
 *   1 FISTS  — plain brawl (generic AI from CombatWorld)
 *   2 KNIFE  — telegraphed lunges. Dodge (move sideways / jump / roll) -> boss whiffs and is open for a long recovery
 *   3 CHAIN  — melee swipes + chain grab. Roll/jump the throw, or MASH to break free (counter-damage)
 * Pure TS (no React/three): the maths is unit-simulated headlessly.
 */
import { CombatWorld, type Fighter } from '@/lib/CombatSystem';

export type DuelPhase = 'fists' | 'knife' | 'chain' | 'dead';
export type BossMode = 'ai' | 'transition' | 'stalk' | 'telegraph' | 'dash' | 'recover' | 'swing' | 'chainWind' | 'grab' | 'stagger' | 'dead';

export const DUEL = {
  bossHp: 600, p2At: 420, p3At: 210, healOnPhase: 30,
  transition: 2.4,
  knife: { damage: 28, telegraph: 0.8, fastTelegraph: 0.5, dash: 0.24, range: 9, speed: 4.2, hitR: 1.25, recoverWhiff: 1.8, recoverHit: 0.9 },
  chain: { speed: 3.4, swingWind: 0.5, swingDmg: 14, swingReach: 3.0, wind: 0.9, throwRange: 10, grabTime: 3, mashStep: 0.11, breakDmg: 30, failDmg: 32, cd: 5.5, stagger: 1.5, recoverWhiff: 1.6 },
  jumpSafeY: 0.8,
};

export interface DuelEvents {
  onPhase?: (p: DuelPhase) => void;
  onTelegraph?: (kind: 'knife' | 'chain') => void;
  onDodged?: () => void;
  onJakeHit?: (dmg: number) => void;
  onGrabbed?: () => void;
  onBroken?: () => void;
}

export class DuelSystem {
  phase: DuelPhase = 'fists';
  mode: BossMode = 'ai';
  t = 0;
  aim = { x: 0, z: 0 };
  dash = { dx: 0, dz: 0, speed: 0, hit: false };
  lunges = 0;
  grabCd = 3;
  swingCd = 1;
  grabT = 0;
  grabProgress = 0;
  ev: DuelEvents = {};

  constructor(private world: CombatWorld, private jake: Fighter, public boss: Fighter) {}

  get grabbed() { return this.mode === 'grab'; }
  /** 0..1 how far through the telegraph we are (for visuals) */
  get telegraphing() { return this.mode === 'telegraph' || this.mode === 'chainWind'; }

  /** Player pressed a mash button while grabbed. */
  mash() { if (this.mode === 'grab') this.grabProgress = Math.min(1, this.grabProgress + DUEL.chain.mashStep); }

  private face(x: number, z: number) { this.boss.yaw = Math.atan2(x - this.boss.pos.x, z - this.boss.pos.z); }
  private dist() { return Math.hypot(this.jake.pos.x - this.boss.pos.x, this.jake.pos.z - this.boss.pos.z); }

  private enter(p: DuelPhase) {
    this.phase = p;
    this.boss.invincible = true;
    this.boss.manual = true;
    this.boss.armor = true;
    this.mode = 'transition';
    this.t = DUEL.transition;
    this.jake.hp = Math.min(this.jake.maxHp, this.jake.hp + DUEL.healOnPhase);
    this.boss.windup = 0; this.boss.anim.windup = 0; this.boss.anim.speed = 0;
    this.ev.onPhase?.(p);
  }

  private move(dt: number, speed: number, tx: number, tz: number) {
    const dx = tx - this.boss.pos.x, dz = tz - this.boss.pos.z, d = Math.hypot(dx, dz) || 1e-4;
    this.boss.pos.x += (dx / d) * speed * dt; this.boss.pos.z += (dz / d) * speed * dt;
    this.boss.anim.speed = Math.min(1, speed / 3.5);
  }

  update(dt: number, jakeY: number) {
    dt = Math.min(dt, 0.05);
    const b = this.boss, j = this.jake;
    if (this.phase === 'dead') return;
    if (b.hp <= 0) { this.phase = 'dead'; this.mode = 'dead'; b.anim.dead = true; return; }
    if (j.hp <= 0) return;

    if (this.phase === 'fists') { if (b.hp <= DUEL.p2At) this.enter('knife'); return; }
    if (this.phase === 'knife' && b.hp <= DUEL.p3At && this.mode !== 'transition') { if (this.mode === 'grab') return; this.enter('chain'); return; }

    this.grabCd -= dt; this.swingCd -= dt;
    this.t -= dt;
    const K = DUEL.knife, C = DUEL.chain;

    switch (this.mode) {
      case 'transition':
        this.face(j.pos.x, j.pos.z); b.anim.speed = 0;
        if (this.t <= 0) { b.invincible = false; this.mode = 'stalk'; this.t = 0.8; }
        break;

      case 'stalk': {
        this.face(j.pos.x, j.pos.z);
        const d = this.dist();
        if (this.phase === 'knife') {
          if (d > K.range - 1) this.move(dt, K.speed, j.pos.x, j.pos.z); else b.anim.speed = 0;
          if (this.t <= 0 && d <= K.range + 1) {
            this.aim.x = j.pos.x; this.aim.z = j.pos.z;
            this.mode = 'telegraph'; this.t = this.lunges % 3 === 2 ? K.fastTelegraph : K.telegraph; this.lunges++;
            b.anim.windup = 1; b.anim.speed = 0; this.ev.onTelegraph?.('knife');
          }
        } else {
          if (d > C.swingReach - 0.4) this.move(dt, C.speed, j.pos.x, j.pos.z); else b.anim.speed = 0;
          if (this.grabCd <= 0 && d < C.throwRange && this.t <= 0) {
            this.mode = 'chainWind'; this.t = C.wind; b.anim.windup = 1; b.anim.speed = 0; this.ev.onTelegraph?.('chain');
          } else if (d <= C.swingReach && this.swingCd <= 0) {
            this.mode = 'swing'; this.t = C.swingWind; b.anim.windup = 1; b.anim.speed = 0;
          }
        }
        break;
      }

      case 'telegraph':
        this.face(this.aim.x, this.aim.z);
        if (this.t <= 0) {
          const dx = this.aim.x - b.pos.x, dz = this.aim.z - b.pos.z, d = Math.hypot(dx, dz) || 1e-4;
          const reach = Math.max(6, d + 2.5);
          this.dash = { dx: dx / d, dz: dz / d, speed: reach / K.dash, hit: false };
          this.mode = 'dash'; this.t = K.dash; b.anim.windup = 0; b.anim.punch = 1;
        }
        break;

      case 'dash':
        b.pos.x += this.dash.dx * this.dash.speed * dt; b.pos.z += this.dash.dz * this.dash.speed * dt;
        if (!this.dash.hit && this.dist() < K.hitR + j.radius && !j.invincible && jakeY < DUEL.jumpSafeY) {
          this.dash.hit = true;
          if (this.world.damage(j, K.damage, b.pos, 8, b)) this.ev.onJakeHit?.(K.damage);
        }
        if (this.t <= 0) {
          this.mode = 'recover'; this.t = this.dash.hit ? K.recoverHit : K.recoverWhiff; b.anim.speed = 0;
          if (!this.dash.hit) this.ev.onDodged?.();
        }
        break;

      case 'swing':
        this.face(j.pos.x, j.pos.z);
        if (this.t <= 0) {
          b.anim.windup = 0; b.anim.punch = 1;
          if (this.dist() <= C.swingReach + j.radius + 0.3 && !j.invincible && jakeY < DUEL.jumpSafeY) {
            if (this.world.damage(j, C.swingDmg, b.pos, 5, b)) this.ev.onJakeHit?.(C.swingDmg);
          }
          this.swingCd = 1.4; this.mode = 'recover'; this.t = 0.55;
        }
        break;

      case 'chainWind':
        this.face(j.pos.x, j.pos.z);
        if (this.t <= 0) {
          b.anim.windup = 0; b.anim.punch = 1; this.grabCd = C.cd;
          if (this.dist() <= C.throwRange && !j.invincible && jakeY < DUEL.jumpSafeY) {
            this.mode = 'grab'; this.grabT = C.grabTime; this.grabProgress = 0; this.ev.onGrabbed?.();
          } else { this.mode = 'recover'; this.t = C.recoverWhiff; this.ev.onDodged?.(); }
        }
        break;

      case 'grab':
        this.grabT -= dt;
        this.grabProgress = Math.max(0, this.grabProgress - 0.05 * dt);
        if (this.grabProgress >= 1) {
          b.invincible = false;
          this.world.damage(b, C.breakDmg, j.pos, 6, j);
          this.mode = 'stagger'; this.t = C.stagger; this.ev.onBroken?.();
        } else if (this.grabT <= 0) {
          if (this.world.damage(j, C.failDmg, b.pos, 8, b)) this.ev.onJakeHit?.(C.failDmg);
          this.mode = 'recover'; this.t = 1.0;
        }
        break;

      case 'stagger':
        b.anim.speed = 0; b.anim.hit = Math.max(b.anim.hit, 0.3);
        if (this.t <= 0) { this.mode = 'stalk'; this.t = 0.5; }
        break;

      case 'recover':
        b.anim.speed = 0;
        if (this.t <= 0) { this.mode = 'stalk'; this.t = 0.6; }
        break;
    }
  }
}
