'use client';
import { useEffect, useState } from 'react';
import { useGame } from '@/lib/store';
import { consume } from '@/lib/input';
import { haptic } from '@/lib/telegram';
import { sfx } from '@/lib/audio';

/** Typewriter dialogue. Tap / E / Interact advances (first press completes the line). */
export default function DialogueBox() {
  const d = useGame((s) => s.dialogue);
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => { setI(0); setChars(0); }, [d]);
  const line = d?.lines[i];

  useEffect(() => {
    if (!line) return;
    setChars(0);
    const id = setInterval(() => setChars((c) => { if (c < line.text.length && c % 2 === 0) sfx.blip(line.who === 'RUGPULL' ? 0.6 : line.who.startsWith('BEAR') ? 0.5 : 1); return c >= line.text.length ? c : c + 1; }), 22);
    return () => clearInterval(id);
  }, [line]);

  const advance = () => {
    if (!d || !line) return;
    haptic.select(); sfx.click();
    if (chars < line.text.length) { setChars(line.text.length); return; }
    if (i + 1 < d.lines.length) setI(i + 1);
    else useGame.getState().endDialogue();
  };

  // keyboard / interact-button advance
  useEffect(() => {
    if (!d) return;
    const id = setInterval(() => { if (consume('interact')) advance(); }, 40);
    return () => clearInterval(id);
  });

  if (!d || !line) return null;
  return (
    <div data-ui className="fade-in pointer-events-auto absolute inset-x-0 bottom-0 z-30 p-3 pb-[max(12px,env(safe-area-inset-bottom))]" onPointerDown={advance}>
      <div className="mx-auto max-w-lg rounded-2xl border-2 bg-black/80 p-4 backdrop-blur" style={{ borderColor: line.color ?? '#fff' }}>
        <div className="font-game text-sm tracking-widest" style={{ color: line.color ?? '#fff' }}>{line.who}</div>
        <div className="mt-1 min-h-[3.2rem] text-[15px] leading-snug text-white">{line.text.slice(0, chars)}</div>
        <div className="mt-1 text-right text-[11px] text-white/50">
          {i + 1}/{d.lines.length} · tap or press E ▶
        </div>
      </div>
    </div>
  );
}
