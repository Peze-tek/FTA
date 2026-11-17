'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/store';

const USERS = ['chickenwing_bandit', 'paperhands_pete', 'lagos_lady', 'PH_bigman', 'londonjolly', 'og_holder_001', 'wagmi_ada', 'danfo_dave', 'tekfix', 'meast_fan'];
const MSGS = [
  'RUGPULL DUMPING HIS OWN BAG 😭', '$3 FAP LET\'S GOOO 🚀', 'Auntie Pol said it first', '30% TAX WHO?? 💀',
  'i sold at 1 cent im crying', 'OG HOLDERS ARE FREE!!', '🚀🚀🚀🚀', 'BRANDON SCANNED THIS EARLY',
  'who is Satoshi Shitoshi 👀', 'MEAST BROKE THE CAGES 💪', 'green candles only', 'tell Rugpull he is rugged',
];
const POL_LINES = [
  'Darling, Rugpull is dumping his OWN bag. Live. On my stream.',
  'I told you. FAPCOIN is the one. Auntie is never wrong.',
  'There is no dip anymore, sweetie. Only up.',
  'Like, share, and stay off the 30% tax.',
];

/** Pol's livestream overlay: chat spam + rising viewer count while the price pumps to $3.20. */
export default function PolLivestream() {
  const on = useGame((s) => s.livestream);
  const price = useGame((s) => s.price);
  const [chat, setChat] = useState<{ id: number; u: string; m: string }[]>([]);
  const [line, setLine] = useState(0);
  const idRef = useRef(0);

  useEffect(() => {
    if (!on) { setChat([]); setLine(0); return; }
    const a = setInterval(() => {
      const id = idRef.current++;
      setChat((c) => [...c.slice(-6), { id, u: USERS[Math.floor(Math.random() * USERS.length)], m: MSGS[Math.floor(Math.random() * MSGS.length)] }]);
    }, 600);
    const b = setInterval(() => setLine((l) => (l + 1) % POL_LINES.length), 2600);
    return () => { clearInterval(a); clearInterval(b); };
  }, [on]);

  if (!on) return null;
  const viewers = Math.round(2400 + Math.min(1, price / 3.2) * 21000);
  return (
    <div className="pointer-events-none absolute left-2 top-[250px] z-30 w-[62%] max-w-[260px] fade-in">
      <div className="flex items-center gap-2 rounded-t-xl bg-gradient-to-r from-pink to-fuchsia-700 px-2 py-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-pink/40 text-lg">💅</div>
        <div className="min-w-0 flex-1">
          <div className="font-game text-[11px] leading-tight text-white">POL LIVE</div>
          <div className="text-[9px] text-white/90">👁 {viewers.toLocaleString()} watching</div>
        </div>
        <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white"><i className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />LIVE</span>
      </div>
      <div className="bg-black/70 px-2 py-1.5 text-[11px] italic text-pink-200">&ldquo;{POL_LINES[line]}&rdquo;</div>
      <div className="flex min-h-[120px] flex-col justify-end gap-0.5 rounded-b-xl bg-black/55 px-2 py-1.5 backdrop-blur-sm">
        {chat.map((c) => (
          <div key={c.id} className="fade-in truncate text-[10px] text-white/90"><b className="text-neon">{c.u}</b> {c.m}</div>
        ))}
      </div>
    </div>
  );
}
