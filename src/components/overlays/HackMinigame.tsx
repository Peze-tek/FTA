'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/store';
import { haptic } from '@/lib/telegram';
import { rng } from '@/lib/rng';

const ROUNDS = 3;
const TIME = [9, 8, 7]; // seconds per round
const HEX = '0123456789ABCDEF';

function makeRound(round: number, seed: number) {
  const r = rng(seed * 7919 + round * 131);
  const code = (): string => Array.from({ length: 6 }, () => HEX[Math.floor(r() * 16)]).join('');
  const target = code();
  const set = new Set<string>([target]);
  const n = 6 + round * 2;
  while (set.size < n) {
    // decoys differ from the target by only 1-2 chars: you have to actually read them
    const a = target.split('');
    const flips = 1 + Math.floor(r() * 2);
    for (let f = 0; f < flips; f++) a[Math.floor(r() * 6)] = HEX[Math.floor(r() * 16)];
    set.add(a.join(''));
  }
  const options = Array.from(set).sort(() => r() - 0.5);
  return { target, options };
}

/**
 * Tek's mission: infiltrate the AI call center that cloned his voice.
 * Code-match hacking mini-game. Zero violence — the staff are just on a night shift.
 */
export default function HackMinigame() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [round, setRound] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [time, setTime] = useState(1);
  const [shake, setShake] = useState(0);
  const [log, setLog] = useState('Cloning voice sample... STOLEN. Match the patch signature.');
  const alertsRef = useRef(0);
  const timeRef = useRef(1);
  const { target, options } = makeRound(round, seed + alerts * 17);
  const done = useRef(false);

  const fail = useCallback((msg: string) => {
    haptic.notify('error'); setShake(Date.now());
    alertsRef.current += 1;
    timeRef.current = 1; setTime(1);
    if (alertsRef.current >= 3) {
      alertsRef.current = 0; setAlerts(0); setRound(0); setSeed((x) => x + 1);
      setLog('SECURITY AI LOCKED YOU OUT — rebooting the intrusion...');
    } else {
      setAlerts(alertsRef.current); setLog(`${msg} (alert ${alertsRef.current}/3)`);
    }
  }, []);

  useEffect(() => {
    timeRef.current = 1; setTime(1);
    const id = setInterval(() => {
      timeRef.current -= 0.1 / TIME[round];
      if (timeRef.current <= 0) fail('TIME OUT — voice model re-synced');
      else setTime(timeRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [round, fail]);

  const pick = (o: string) => {
    if (done.current) return;
    if (o !== target) { fail('WRONG SIGNATURE'); return; }
    haptic.notify('success');
    if (round + 1 >= ROUNDS) {
      done.current = true;
      const s = useGame.getState();
      s.setMinigame(null);
      s.setQuestStep('talk');
      s.toast('Voice clone deleted. Nobody got hurt. Talk to Tek.', 'good');
    } else {
      setRound(round + 1); setLog(`Firewall ${round + 1}/${ROUNDS} cracked...`);
    }
  };

  return (
    <div data-ui className="fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div key={shake} className={`w-full max-w-md rounded-2xl border-2 border-fap/70 bg-[#02130a] p-4 font-mono text-fap ${shake ? 'animate-shake' : ''}`}>
        <div className="flex items-center justify-between text-[11px] tracking-widest text-fap/70">
          <span>AI CALL CENTER · LEVEL {round + 1}/{ROUNDS}</span>
          <span className="text-rug">ALERTS {alerts}/3</span>
        </div>
        <div className="mt-2 text-xs text-fap/80">{log}</div>
        <div className="mt-3 rounded-lg border border-fap/40 bg-black/60 p-3 text-center">
          <div className="text-[10px] tracking-widest text-fap/60">MATCH THIS SIGNATURE</div>
          <div className="font-game text-3xl tracking-[0.3em] text-white">{target}</div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-fap/15">
          <div className="h-full bg-fap transition-[width] duration-100" style={{ width: `${time * 100}%`, background: time < 0.3 ? '#ff2d55' : undefined }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button key={o} onClick={() => pick(o)}
              className="rounded-lg border border-fap/40 bg-fap/10 py-3 text-lg tracking-[0.2em] text-fap active:bg-fap/40">{o}</button>
          ))}
        </div>
        <div className="mt-3 text-center text-[11px] text-fap/50">No violence. The staff are just on a night shift.</div>
      </div>
    </div>
  );
}
