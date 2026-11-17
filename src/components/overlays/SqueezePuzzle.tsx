'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';
import { makeSqueezeRound, liqOrder } from '@/lib/squeezePuzzle';
import { PRICE_TARGET, formatPrice } from '@/lib/PriceSystem';

const TIME_LIMIT = 40;

/** Lives outside the component so it survives the overlay unmounting. */
function completeSqueeze() {
  const s = useGame.getState();
  s.setMinigame(null);
  s.showBanner(`SHORT SQUEEZE → ${formatPrice(PRICE_TARGET.l3)}`, 3600);
  s.pump(PRICE_TARGET.l3, 6000);
  haptic.notify('success');
  setTimeout(() => {
    const g = useGame.getState();
    if (g.screen === 'game' && g.level === 3) g.completeLevel(3);
  }, 8500);
}

export default function SqueezePuzzle() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const round = useMemo(() => makeSqueezeRound(seed), [seed]);
  const order = useMemo(() => liqOrder(round), [round]);
  const [done, setDone] = useState<string[]>([]);
  const [time, setTime] = useState(TIME_LIMIT);
  const [msg, setMsg] = useState('Liquidate the shorts in order: LOWEST liquidation price first.');
  const [shake, setShake] = useState(0);
  const timeRef = useRef(TIME_LIMIT);
  const finished = useRef(false);

  useEffect(() => {
    timeRef.current = TIME_LIMIT; setTime(TIME_LIMIT); setDone([]);
    const id = setInterval(() => {
      if (finished.current) return;
      timeRef.current -= 0.1;
      if (timeRef.current <= 0) {
        haptic.notify('error'); setShake(Date.now());
        setSeed((x) => x + 1);
        setMsg('Bears topped up their margin. New positions — go again.');
        timeRef.current = TIME_LIMIT;
      }
      setTime(timeRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [seed]);

  const tap = (id: string) => {
    if (finished.current || done.includes(id)) return;
    if (order[done.length] === id) {
      const nd = [...done, id];
      setDone(nd); haptic.impact('medium'); sfx.slam();
      if (nd.length === round.length) {
        finished.current = true; setMsg('FULL CASCADE! 💥');
        setTimeout(completeSqueeze, 700);
      } else setMsg(`Liquidated! Chain ${nd.length}/${round.length} — next lowest liq…`);
    } else {
      haptic.notify('error'); setShake(Date.now()); sfx.toast('bad');
      timeRef.current = Math.max(1, timeRef.current - 4); setTime(timeRef.current);
      setDone([]); setMsg('Wrong order — the chain broke! −4s. Remember liq = entry × (1 + 1/leverage).');
    }
  };

  return (
    <div data-ui className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-3">
      <div key={shake} className={`w-full max-w-sm rounded-2xl border border-rug/60 bg-[#12091c] p-3 ${shake ? 'animate-shake' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="font-game text-base text-rug">🐻 SHORT SQUEEZE</div>
          <div className="font-game text-sm text-white">{Math.ceil(time)}s</div>
        </div>
        <div className="mb-2 mt-0.5 text-[11px] leading-snug text-white/70">{msg}</div>
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-rug" style={{ width: `${(time / TIME_LIMIT) * 100}%` }} /></div>
        <div className="grid grid-cols-2 gap-2">
          {round.map((p) => {
            const hit = done.includes(p.id);
            return (
              <button key={p.id} onClick={() => tap(p.id)} disabled={hit}
                className={`rounded-xl border p-2 text-left transition-all active:scale-95 ${hit ? 'border-fap/60 bg-fap/10 opacity-70' : 'border-white/20 bg-white/5'}`}>
                <div className="truncate font-game text-[11px] text-white">{p.name}</div>
                <div className="mt-0.5 text-[10px] text-white/60">SHORT {p.size}M FAP</div>
                <div className="text-[10px] text-white/80">Entry <b>${p.entry.toFixed(2)}</b> · <b className="text-amber-300">{p.lev}x</b></div>
                <div className="mt-0.5 text-[10px]">{hit ? <span className="text-fap">LIQ ${p.liq.toFixed(2)} 💥 #{done.indexOf(p.id) + 1}</span> : <span className="text-white/40">liq: ???</span>}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
