/**
 * Screen transitions. TransitionLayer registers its black overlay here; anything can then call:
 *  - fadeBlack(ms)      fade to black (and stay)
 *  - reveal(ms)         fade from black to the scene
 *  - dip(ms)            instantly black -> fade out (hides a scene swap that already happened)
 *  - transitionTo(fn)   fade to black, run fn (the swap), then reveal
 */
let el: HTMLDivElement | null = null;
let seq = 0;
export function registerOverlay(e: HTMLDivElement | null) { el = e; }

function set(opacity: number, ms: number, ease = 'ease-in-out') {
  if (!el) return;
  el.style.transition = ms > 0 ? `opacity ${ms}ms ${ease}` : 'none';
  void el.offsetWidth;                         // flush so the next change animates from here
  el.style.opacity = String(opacity);
}
export function fadeBlack(ms = 300) { seq++; set(1, ms, 'ease-in'); }
export function reveal(ms = 600) { seq++; set(0, ms, 'ease-out'); }
export function dip(ms = 650) { seq++; set(1, 0); requestAnimationFrame(() => requestAnimationFrame(() => set(0, ms, 'ease-out'))); }
export function transitionTo(fn: () => void, out = 280, hold = 120, inn = 650) {
  if (!el) { fn(); return; }
  const my = ++seq;
  set(1, out, 'ease-in');
  setTimeout(() => {
    fn();
    setTimeout(() => { if (my === seq) set(0, inn, 'ease-out'); }, hold);
  }, out);
}
