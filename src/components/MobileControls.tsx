'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { input, isTouchDevice, press, type PressName } from '@/lib/input';
import { useGame } from '@/lib/store';
import { haptic, tg } from '@/lib/telegram';

const R = 56; // joystick radius px

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [k, setK] = useState({ x: 0, y: 0 });

  const upd = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    input.joyX = dx / R;
    input.joyY = -dy / R;
    setK({ x: dx, y: dy });
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current) return;
    pid.current = null; input.joyX = 0; input.joyY = 0; setK({ x: 0, y: 0 });
  };
  return (
    <div
      ref={base} data-ui
      className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-5 h-[132px] w-[132px] rounded-full border-[3px] border-white/55 bg-black/35 shadow-[0_3px_10px_rgba(0,0,0,.55)] backdrop-blur-sm"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pid.current = e.pointerId; upd(e); }}
      onPointerMove={(e) => { if (e.pointerId === pid.current) upd(e); }}
      onPointerUp={end} onPointerCancel={end}
    >
      <span className="absolute left-1/2 top-[3px] -translate-x-1/2 text-[9px] text-white/70">▲</span>
      <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 text-[9px] text-white/70">▼</span>
      <span className="absolute left-[5px] top-1/2 -translate-y-1/2 text-[9px] text-white/70">◀</span>
      <span className="absolute right-[5px] top-1/2 -translate-y-1/2 text-[9px] text-white/70">▶</span>
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-[3px] border-white/80 bg-white/35 shadow-[0_2px_6px_rgba(0,0,0,.5)]"
        style={{ transform: `translate(calc(-50% + ${k.x}px), calc(-50% + ${k.y}px))` }} />
    </div>
  );
}

/** Drag anywhere on the right side to orbit the camera. */
function LookPad() {
  const pid = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  return (
    <div
      data-ui className="absolute bottom-0 right-0 top-[18%] w-[62%]" style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        e.currentTarget.setPointerCapture(e.pointerId); pid.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pid.current) return;
        input.lookDX += (e.clientX - last.current.x) * 1.5;
        input.lookDY += (e.clientY - last.current.y) * 1.5;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => { if (e.pointerId === pid.current) pid.current = null; }}
      onPointerCancel={() => { pid.current = null; }}
    />
  );
}

/* ---- GTA-style line icons (white, drawn with currentColor) */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
export const ICONS: Record<string, ReactNode> = {
  bullet: <Ic><g transform="rotate(45 12 12)"><path d="M12 2c2.6 2 3.6 4.6 3.6 7.2V17h-7.2V9.2C8.4 6.6 9.4 4 12 2z" fill="currentColor" /><rect x="8.4" y="18.6" width="7.2" height="2.6" rx=".7" fill="currentColor" /></g></Ic>,
  aim: <Ic><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></Ic>,
  run: <Ic><circle cx="14.5" cy="4.5" r="2" fill="currentColor" /><path d="M9 21l3.2-6.2 3 2.4 1.2 3.8M12.2 14.8l-1.4-5 4.3-1.2 2.4 3.4-3 .9M10.8 9.8L7 12" /></Ic>,
  swap: <Ic><path d="M6 8h12l-3-3.5M18 16H6l3 3.5" /></Ic>,
  roll: <Ic><path d="M20 12a8 8 0 1 1-2.6-5.9M20.4 3.6v4.6h-4.6" /></Ic>,
  fist: <Ic><path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v3m0-2.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4.5a5.5 5.5 0 0 1-5.5 5.5H12a5 5 0 0 1-5-5v-4a1.5 1.5 0 0 1 1.5-1.5z" /></Ic>,
  hand: <Ic><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V12m0-4.5a1.5 1.5 0 0 1 3 0V14m0-3a1.5 1.5 0 0 1 3 0v4.5A5.5 5.5 0 0 1 14.5 21H13a6 6 0 0 1-5-2.7L5 14.5a1.6 1.6 0 0 1 2.5-2L8 13" /></Ic>,
  flex: <Ic><path d="M4 16c1-5 4-8 8-8 2 0 3 1 3 2.5S14 13 13 13.5c3 .5 6 2.5 6 5.5H8c-2 0-3.500-1-4-3z" /><path d="M9 10.500V8" /></Ic>,
  crouch: <Ic><circle cx="9" cy="5" r="2" fill="currentColor" /><path d="M9 8l-1 5 4 1 3 5M8 13l-3 6M12 9l4 2" /></Ic>,
  grab: <Ic><path d="M7 12V8a2 2 0 0 1 4 0v3m0-2a2 2 0 0 1 4 0v3m0-1a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.700L4 14.500" /></Ic>,
  barrel: <Ic><ellipse cx="12" cy="6.5" rx="6" ry="2.5" /><path d="M6 6.500v11c0 1.400 2.700 2.500 6 2.500s6-1.100 6-2.500v-11M6 12c0 1.400 2.700 2.500 6 2.500s6-1.100 6-2.500" /></Ic>,
  boost: <Ic><path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="currentColor" /></Ic>,
  usb: <Ic><path d="M12 3v13M12 16a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5zM12 9l-4-1.500V10M12 12l4-1.500V8" /></Ic>,
  down: <Ic><path d="M5 9l7 7 7-7" strokeWidth="2.600" /></Ic>,
  up: <Ic><path d="M5 15l7-7 7 7" strokeWidth="2.600" /></Ic>,
  left: <Ic><path d="M15 5l-7 7 7 7" strokeWidth="2.600" /></Ic>,
  right: <Ic><path d="M9 5l7 7-7 7" strokeWidth="2.600" /></Ic>,
};

function Btn({ children, onDown, onUp, className = '', big, icon, label }: {
  children?: ReactNode; onDown: () => void; onUp?: () => void; className?: string; big?: boolean; icon?: keyof typeof ICONS; label?: string;
}) {
  return (
    <button
      data-ui aria-label={label}
      className={`flex flex-col items-center justify-center rounded-full border-[3px] border-white/70 bg-black/40 font-game text-white shadow-[0_3px_10px_rgba(0,0,0,.55),inset_0_0_0_2px_rgba(0,0,0,.35)] backdrop-blur-sm active:scale-90 active:bg-white/30 ${big ? 'h-[84px] w-[84px]' : 'h-[62px] w-[62px]'} ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => { e.preventDefault(); haptic.impact('light'); onDown(); }}
      onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
    >
      {icon ? <span className={`block drop-shadow-[0_1px_1px_rgba(0,0,0,.8)] ${big ? 'h-[46px] w-[46px]' : 'h-[32px] w-[32px]'}`}>{ICONS[icon]}</span> : children}
      {label && <span className="mt-[-1px] text-[7px] tracking-widest text-white/80">{label}</span>}
    </button>
  );
}

/** Mobile overlay: virtual joystick + look pad + context action buttons. Hidden on desktop. */
export default function MobileControls() {
  const [show, setShow] = useState(false);
  const noViolence = useGame((s) => s.noViolence);
  const level = useGame((s) => s.level);
  const surv = useGame((s) => s.mode === 'survival');
  const driving = useGame((s) => s.driving || (s.free && s.fight.stage === 'DRIVING'));
  const freePlay = useGame((s) => s.free);
  const paused = useGame((s) => s.paused);
  const [crouch, setCrouch] = useState(false);
  const busy = useGame((s) => !!(s.dialogue || s.minigame || s.cutscene));
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('touch') === '1';
    setShow(q || isTouchDevice() || ['android', 'ios'].includes(tg()?.platform ?? ''));
  }, []);
  if (!show || busy || paused) return null;
  const tap = (n: PressName) => () => press(n);
  // Free play, in a car: steer + GAS + REVERSE + FIRE (shoot from the window)
  if (driving) return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-4 flex gap-3">
        <Btn big icon="left" label="LEFT" onDown={() => { input.joyX = -1; }} onUp={() => { input.joyX = input.joyX < 0 ? 0 : input.joyX; }} />
        <Btn big icon="right" label="RIGHT" onDown={() => { input.joyX = 1; }} onUp={() => { input.joyX = input.joyX > 0 ? 0 : input.joyX; }} />
      </div>
      <div className="pointer-events-auto absolute bottom-[max(24px,env(safe-area-inset-bottom))] right-4 flex items-end gap-3">
        <Btn icon="down" label="REVERSE" onDown={() => { input.held.rev = true; }} onUp={() => { input.held.rev = false; }} className="text-amber-300" />
        <Btn big icon="up" label="GAS" onDown={() => { input.held.gas = true; }} onUp={() => { input.held.gas = false; }} className="text-fap" />
      </div>
      {freePlay && <div className="pointer-events-auto absolute bottom-[max(120px,calc(env(safe-area-inset-bottom)+96px))] right-4">
        <Btn big icon="bullet" label="FIRE" onDown={() => { input.held.fire = true; press('punch'); }} onUp={() => { input.held.fire = false; }} className="text-rug" />
      </div>}
    </div>
  );
  if (level === 4) return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-4 flex gap-3">
        <Btn big icon="left" label="LEFT" onDown={tap('left')} />
        <Btn big icon="right" label="RIGHT" onDown={tap('right')} />
      </div>
      <div className="pointer-events-auto absolute bottom-[max(28px,env(safe-area-inset-bottom))] right-4 flex items-end gap-3">
        <Btn icon="barrel" label="BARREL" onDown={tap('barrel')} className="text-amber-300" />
        <Btn big icon="boost" label="BOOST" onDown={() => { input.held.boost = true; }} onUp={() => { input.held.boost = false; }} className="text-fap" />
        <Btn icon="usb" label="USB" onDown={tap('interact')} className="text-neon" />
      </div>
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto"><LookPad /></div>
      <div className="pointer-events-auto"><Joystick /></div>
      <div className="pointer-events-auto absolute bottom-[max(28px,env(safe-area-inset-bottom))] right-5 h-[210px] w-[200px]">
        <Btn big icon={level === 5 ? 'bullet' : 'hand'} label={level === 5 ? 'FIRE' : 'ACT'}
          onDown={surv ? () => { input.held.fire = true; press('punch'); } : tap(level === 5 ? 'punch' : 'interact')}
          onUp={surv ? () => { input.held.fire = false; } : undefined}
          className={`absolute bottom-0 right-0 ${level === 5 ? 'text-rug' : 'text-fap'}`} />
        <Btn icon="run" label="JUMP" onDown={tap('jump')} className="absolute bottom-[96px] right-[10px]" />
        {level === 2 ? (<>
          <Btn icon="grab" label="HOLD" onDown={() => { input.held.hold = true; }} onUp={() => { input.held.hold = false; }}
            className="absolute bottom-[22px] right-[106px] text-amber-300" />
          <Btn icon="crouch" label="CROUCH" onDown={() => { input.held.crouch = !input.held.crouch; setCrouch(input.held.crouch); }}
            className={`absolute bottom-[100px] right-[104px] ${crouch ? 'border-fap bg-fap/30 text-fap' : ''}`} />
        </>) : level === 5 ? (<>
          <Btn icon={surv ? 'swap' : 'grab'} label={surv ? 'SWAP' : 'GRAB'} onDown={tap(surv ? 'swap' : 'grab')} className="absolute bottom-[22px] right-[106px] text-fap" />
          <Btn icon="roll" label="DODGE" onDown={tap('dodge')} className="absolute bottom-[100px] right-[104px] text-neon" />
        </>) : level === 3 ? (<>
          <Btn icon="fist" label="PUNCH" onDown={tap('punch')} className="absolute bottom-[22px] right-[106px] text-rug" />
          <Btn icon="flex" label="MEAST" onDown={tap('special')} className="absolute bottom-[100px] right-[104px] text-amber-300" />
        </>) : (
          <Btn icon="fist" label="PUNCH" onDown={tap('punch')} className={`absolute bottom-[22px] right-[106px] ${noViolence ? 'opacity-30' : 'text-rug'}`} />
        )}
      </div>
    </div>
  );
}
