'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';
import { makeDumpRound } from '@/lib/dumpPuzzle';
import { PRICE_TARGET, formatPrice } from '@/lib/PriceSystem';

const TIME_LIMIT = 35; // seconds
const HOLD_MS = 1100;

/** Success sequence lives outside the component so it survives the overlay unmounting. */
function completeDump() {
  const s = useGame.getState();
  s.setMinigame(null);
  s.setLivestream(true);
  s.showBanner(`RUGPULL DUMPED → ${formatPrice(PRICE_TARGET.l2)}`, 3200);
  s.pump(PRICE_TARGET.l2, 5000);
  haptic.notify('success');
  setTimeout(() => {
    const g = useGame.getState();
    g.setLivestream(false);
    if (g.screen === 'game' && g.level === 2) g.completeLevel(2);
  }, 9500);
}

export default function DumpPuzzle() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const round = useMemo(() => makeDumpRound(seed), [seed]);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('Find the token held by RUGPULL\'s wallet and dump it. NOT FAPCOIN.');
  const [time, setTime] = useState(TIME_LIMIT);
  const [shake, setShake] = useState(0);
  const [hold, setHold] = useState(0);
  const timeRef = useRef(TIME_LIMIT);
  const holdStart = useRef<number | null>(null);
  const raf = useRef(0);
  const done = useRef(false);
  const selRef = useRef<string | null>(null);
  selRef.current = sel;

  const wrong = useCallback((text: string, penalty: number) => {
    haptic.notify('error'); sfx.toast('bad'); setShake(Date.now()); setMsg(text); setSel(null);
    timeRef.current = Math.max(1, timeRef.current - penalty); setTime(timeRef.current);
  }, []);

  useEffect(() => {
    timeRef.current = TIME_LIMIT; setTime(TIME_LIMIT);
    const id = setInterval(() => {
      if (done.current) return;
      timeRef.current -= 0.1;
      if (timeRef.current <= 0) {
        haptic.notify('error'); setShake(Date.now());
        setSeed((x) => x + 1); setSel(null);
        setMsg('LOCKED OUT — Rugpull rotated his wallet. Rebooting the intrusion...');
        timeRef.current = TIME_LIMIT;
      }
      setTime(timeRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [seed]);

  const confirm = useCallback(() => {
    const id = selRef.current;
    if (!id || done.current) return;
    const t = round.tokens.find((x) => x.id === id)!;
    if (id === round.correctId) { done.current = true; completeDump(); return; }
    if (id === 'fap') {
      // the trap: you just dumped your own coin
      const s = useGame.getState();
      const p = s.price;
      s.setPrice(p * 0.6); s.pump(p, 2400);
      s.toast('YOU DUMPED FAPCOIN!! Price -40%... recovering', 'bad');
      wrong('NOT FAPCOIN!! That was OUR coin. (-6s)', 6);
    } else if (id === 'lookalike') {
      wrong(`${t.ticker}'s top holder is a LOOKALIKE wallet — one digit off. Read it again. (-4s)`, 4);
    } else wrong(`${t.ticker} isn't held by Rugpull's wallet. (-4s)`, 4);
  }, [round, wrong]);

  const tick = useCallback(() => {
    if (holdStart.current === null) return;
    const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
    setHold(p);
    if (p >= 1) { holdStart.current = null; setHold(0); confirm(); return; }
    raf.current = requestAnimationFrame(tick);
  }, [confirm]);
  const startHold = () => {
    if (!sel) { setMsg('Select a token first.'); return; }
    holdStart.current = performance.now(); haptic.impact('medium'); raf.current = requestAnimationFrame(tick);
  };
  const endHold = () => { holdStart.current = null; cancelAnimationFrame(raf.current); setHold(0); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div data-ui className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm">
      <div key={shake} className={`my-auto w-full max-w-md rounded-2xl border-2 border-rug/70 bg-[#12060b] p-3 font-mono ${shake ? 'animate-shake' : ''}`}>
        <div className="flex items-center justify-between text-[10px] tracking-widest text-rug/80">
          <span>RUGGED PUB · MAIN TERMINAL</span>
          <button className="rounded bg-white/10 px-2 py-0.5 text-white/70" onClick={() => useGame.getState().setMinigame(null)}>✕ back</button>
        </div>
        <div className="mt-2 rounded-lg border border-rug/40 bg-black/60 p-2 text-center">
          <div className="text-[10px] tracking-widest text-white/50">RUGPULL&apos;S WALLET</div>
          <div className="font-game text-2xl tracking-wider text-rug">{round.wallet}</div>
        </div>
        <div className="mt-2 min-h-[2.4rem] text-[12px] leading-snug text-amber-200">{msg}</div>
        <div className="mt-1 h-2 overflow-hidden rounded bg-white/10">
          <div className="h-full" style={{ width: `${(time / TIME_LIMIT) * 100}%`, background: time < 8 ? '#ff2d55' : '#fbbf24', transition: 'width .1s linear' }} />
        </div>
        <div className="mt-2 space-y-1.5">
          {round.tokens.map((t) => {
            const on = sel === t.id;
            return (
              <button key={t.id} onClick={() => { haptic.select(); setSel(t.id); }}
                className={`w-full rounded-lg border p-2 text-left transition-colors ${on ? 'border-fap bg-fap/15' : 'border-white/15 bg-white/5'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-game text-sm text-white">{t.ticker}</span>
                  <span className="text-[10px] text-white/50">tax {t.tax}% · {t.note}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-[11px] text-white/70">
                  <span>deployer: {t.deployer}</span>
                </div>
                <div className="text-[12px] text-white/90">top holder: <b className="tracking-wide">{t.topHolder}</b> <span className="text-white/50">({t.topPct}%)</span></div>
              </button>
            );
          })}
        </div>
        <button
          className="relative mt-3 w-full select-none overflow-hidden rounded-xl border-2 border-rug bg-rug/20 py-3 font-game text-lg text-white"
          style={{ touchAction: 'none' }}
          onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}>
          <span className="absolute inset-y-0 left-0 bg-rug/70" style={{ width: `${hold * 100}%` }} />
          <span className="relative">{sel ? 'HOLD TO DUMP' : 'SELECT A TOKEN'}</span>
        </button>
      </div>
    </div>
  );
}
