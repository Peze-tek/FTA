/**
 * Shared mutable input state. Read every frame by game code (no React re-renders).
 * Desktop keyboard/mouse and the mobile overlay both write into this object.
 */
export type PressName =
  | 'interact' | 'punch' | 'jump' | 'special' | 'dodge' | 'barrel' | 'left' | 'right' | 'grab'
  | 'swap' | 'slot0' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5';

export const input = {
  joyX: 0,
  joyY: 0, // +y = forward
  keyX: 0,
  keyY: 0,
  lookDX: 0,
  lookDY: 0,
  held: { hold: false, sprint: false, crouch: false, boost: false, fire: false, gas: false, rev: false },
  pressed: {
    interact: false, punch: false, jump: false, special: false, dodge: false,
    barrel: false, left: false, right: false, grab: false,
    swap: false, slot0: false, slot1: false, slot2: false, slot3: false, slot4: false, slot5: false,
  } as Record<PressName, boolean>,
  pointerLocked: false,
};

export function press(n: PressName) { input.pressed[n] = true; }
export function consume(n: PressName) {
  const v = input.pressed[n];
  input.pressed[n] = false;
  return v;
}
export function clearPresses() {
  (Object.keys(input.pressed) as PressName[]).forEach((k) => (input.pressed[k] = false));
}
/** Any "mash" style button. */
export function consumeMash() {
  let any = false;
  for (const n of ['interact', 'jump', 'grab', 'punch'] as PressName[]) any = consume(n) || any;
  return any;
}

export function moveVec() {
  let x = input.joyX + input.keyX;
  let y = input.joyY + input.keyY;
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x, y, mag: Math.min(1, m) };
}

export function consumeLook() {
  const d = { x: input.lookDX, y: input.lookDY };
  input.lookDX = 0;
  input.lookDY = 0;
  return d;
}

const down = new Set<string>();
let mouseFire = false;
function recompute() {
  input.keyX = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
  input.keyY = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
  input.held.sprint = down.has('ShiftLeft') || down.has('ShiftRight');
  input.held.boost = input.held.sprint;
  input.held.crouch = down.has('KeyC') || down.has('ControlLeft');
  input.held.hold = down.has('KeyF');
  input.held.fire = mouseFire || down.has('KeyJ');
}

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** Attach keyboard + mouse listeners. Returns a cleanup function. */
export function attachDesktopInput(canvasEl: HTMLElement) {
  const kd = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      switch (e.code) {
        case 'KeyE': press('interact'); break;
        case 'Space': press('jump'); press('dodge'); break;
        case 'KeyJ': press('punch'); break;
        case 'KeyQ': press('special'); break;
        case 'KeyB': press('barrel'); break;
        case 'KeyX': case 'Tab': press('swap'); break;
        case 'Digit0': case 'KeyH': press('slot0'); break;
        case 'Digit1': press('slot1'); break;
        case 'Digit2': press('slot2'); break;
        case 'Digit3': press('slot3'); break;
        case 'Digit4': press('slot4'); break;
        case 'Digit5': press('slot5'); break;
        case 'KeyG': case 'KeyF': press('grab'); break;
        case 'ArrowLeft': case 'KeyA': press('left'); break;
        case 'ArrowRight': case 'KeyD': press('right'); break;
      }
    }
    down.add(e.code);
    recompute();
  };
  const ku = (e: KeyboardEvent) => { down.delete(e.code); recompute(); };
  const mm = (e: MouseEvent) => {
    if (document.pointerLockElement || (e.buttons & 2)) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
    }
  };
  const md = (ev: MouseEvent) => {
    const e = ev as MouseEvent & { pointerType?: string };
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    if ((e.target as HTMLElement | null)?.closest?.('button,[data-ui]')) return; // clicking UI shouldn't swing/lock
    if (e.button === 0) {
      mouseFire = true; recompute();
      if (document.pointerLockElement) press('punch');
      else if (!isTouchDevice()) {
        try { (canvasEl.requestPointerLock as () => void)?.call(canvasEl); } catch { /* ignore */ }
        press('punch');
      }
    }
  };
  const plc = () => { input.pointerLocked = !!document.pointerLockElement; };
  const ctx = (e: Event) => e.preventDefault();
  const blur = () => { down.clear(); mouseFire = false; recompute(); };
  const mu = () => { if (mouseFire) { mouseFire = false; recompute(); } };
  const wh = (e: WheelEvent) => { if (Math.abs(e.deltaY) > 4) press('swap'); };

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousemove', mm);
  window.addEventListener('blur', blur);
  window.addEventListener('pointerup', mu);
  window.addEventListener('wheel', wh, { passive: true });
  canvasEl.addEventListener('pointerdown', md as unknown as EventListener);
  canvasEl.addEventListener('contextmenu', ctx);
  document.addEventListener('pointerlockchange', plc);
  return () => {
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pointerup', mu);
    window.removeEventListener('wheel', wh);
    canvasEl.removeEventListener('pointerdown', md as unknown as EventListener);
    canvasEl.removeEventListener('contextmenu', ctx);
    document.removeEventListener('pointerlockchange', plc);
  };
}
