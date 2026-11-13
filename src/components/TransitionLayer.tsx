'use client';
import { useEffect, useRef } from 'react';
import { useGame } from '@/lib/store';
import { registerOverlay, dip } from '@/lib/transition';

/** Black fade overlay + cinematic letterbox bars. Scene swaps (screen / level / cutscene / game over) are masked by a dip. */
export default function TransitionLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const cutscene = useGame((s) => !!s.cutscene);

  useEffect(() => {
    registerOverlay(ref.current);
    const un = useGame.subscribe((s, p) => {
      if (
        s.screen !== p.screen || s.level !== p.level || s.mode !== p.mode || s.free !== p.free || s.levelKey !== p.levelKey ||
        !!s.cutscene !== !!p.cutscene || (!!s.gameOver && !p.gameOver) || (s.toBeContinued && !p.toBeContinued)
      ) dip(s.cutscene && !p.cutscene ? 900 : 700);
    });
    return () => { un(); registerOverlay(null); };
  }, []);

  return (
    <>
      {/* letterbox bars slide in during cutscenes */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[120] bg-black" style={{ height: cutscene ? '9vh' : 0, transition: 'height 700ms cubic-bezier(.22,.8,.3,1)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[120] bg-black" style={{ height: cutscene ? '9vh' : 0, transition: 'height 700ms cubic-bezier(.22,.8,.3,1)' }} />
      <div ref={ref} className="pointer-events-none absolute inset-0 z-[150] bg-black" style={{ opacity: 0 }} />
    </>
  );
}
