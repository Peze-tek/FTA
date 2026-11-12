/** Kill combo: kills chained inside the window build a multiplier + callouts (DOUBLE KILL, TRIPLE KILL...). */
export const COMBO_WINDOW = 3.5;
export interface ComboState { n: number; t: number; best: number; score: number }
export const newCombo = (): ComboState => ({ n: 0, t: 0, best: 0, score: 0 });
export const multOf = (n: number) => (n < 2 ? 1 : Math.min(5, 1 + 0.5 * (n - 1)));
const NAMES: Record<number, string> = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };

/** Register one kill; returns a callout to show (or null). */
export function comboKill(c: ComboState): string | null {
  c.n = c.t > 0 ? c.n + 1 : 1;
  c.t = COMBO_WINDOW;
  c.best = Math.max(c.best, c.n);
  c.score += Math.round(10 * multOf(c.n));
  return NAMES[c.n] ?? (c.n > 10 && c.n % 5 === 0 ? `${c.n} KILL STREAK` : null);
}
export function comboTick(c: ComboState, dt: number) {
  if (c.t > 0) { c.t -= dt; if (c.t <= 0) { c.t = 0; c.n = 0; } }
}
export const comboHud = (c: ComboState) => ({ combo: c.n, comboT: c.n ? Math.max(0, c.t / COMBO_WINDOW) : 0, mult: multOf(c.n), bestCombo: c.best, score: c.score });
