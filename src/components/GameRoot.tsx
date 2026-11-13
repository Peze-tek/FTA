'use client';
import { useEffect, useRef } from 'react';
import { attachDesktopInput, input, type PressName } from '@/lib/input';
import { setAudioPaused } from '@/lib/audio';
import { cloudLoad, initTelegram } from '@/lib/telegram';
import { useGame, type SaveData } from '@/lib/store';
import GameCanvas from '@/components/GameCanvas';
import HUD from '@/components/HUD';
import MobileControls from '@/components/MobileControls';
import MainMenu from '@/components/MainMenu';
import TransitionLayer from '@/components/TransitionLayer';
import AudioDirector from '@/components/AudioDirector';
import { tryLockLandscape, useNeedsRotate } from '@/lib/orientation';

export default function GameRoot() {
  const screen = useGame((s) => s.screen);
  const wrap = useRef<HTMLDivElement>(null);
  const rotate = useNeedsRotate();
  useEffect(() => { if (screen === 'game') tryLockLandscape(); }, [screen]);

  useEffect(() => {
    initTelegram();
    cloudLoad<SaveData>().then((s) => { if (s && s.level) useGame.getState().applySave(s); });
  }, []);

  useEffect(() => (wrap.current ? attachDesktopInput(wrap.current) : undefined), []);

  // pause: freeze audio, drop held / queued input so nothing fires on resume
  useEffect(() => useGame.subscribe((s, p) => {
    if (s.paused === p.paused) return;
    setAudioPaused(s.paused);
    input.joyX = 0; input.joyY = 0; input.keyX = 0; input.keyY = 0; input.lookDX = 0; input.lookDY = 0;
    for (const k of Object.keys(input.held) as (keyof typeof input.held)[]) input.held[k] = false;
    for (const k of Object.keys(input.pressed) as PressName[]) input.pressed[k] = false;
  }), []);
  useEffect(() => { if (screen !== 'game' && useGame.getState().paused) useGame.getState().setPaused(false); }, [screen]);

  // Dev helper for screenshots: /?shot=menu | l1 | l2 | l3 | l4 | l5 | survival  (see scripts/snapshots.mjs)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('shot');
    if (!q || q === 'menu') return;
    const t = setTimeout(() => {
      const g = useGame.getState();
      if (!g.playerName) g.setPlayerName('TEK');
      if (q === 'survival') g.startSurvival();
      else if (/^l[1-5]$/.test(q)) g.startGame(Number(q[1]) as 1 | 2 | 3 | 4 | 5, true);
      setTimeout(() => { const s = useGame.getState(); s.endCutscene(); s.endDialogue(); }, 1500);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={wrap} className="fixed inset-0 select-none overflow-hidden bg-[#07040f]" style={{ touchAction: 'none' }}>
      {screen === 'game' && (<>
        <GameCanvas />
        <HUD />
        <MobileControls />
      </>)}
      {screen === 'menu' && <MainMenu />}
      {screen === 'game' && rotate && (
        <div data-ui className="pointer-events-auto absolute inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#07040f] p-8 text-center">
          <svg viewBox="0 0 64 64" width="96" height="96" fill="none" stroke="#39ff88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="rotate-hint">
            <rect x="20" y="6" width="24" height="46" rx="4" /><path d="M30 46h4" /><path d="M8 40c0 10 7 17 17 17M58 24c0-10-7-17-17-17M21 51l4 6-6 3M43 13l-4-6 6-3" />
          </svg>
          <div className="font-game text-3xl text-white drop-shadow-[0_0_12px_#39ff88]">TURN YOUR PHONE SIDEWAYS AND RESTART</div>
          <div className="max-w-xs text-sm text-white/70">Fap Theft Auto is played in landscape. Rotate your phone (and turn off rotation lock), then restart the game.</div>
          <style>{`@keyframes rotHint{0%,30%{transform:rotate(0)}70%,100%{transform:rotate(-90deg)}}.rotate-hint{animation:rotHint 1.8s ease-in-out infinite alternate}`}</style>
        </div>
      )}
      <TransitionLayer />
      <AudioDirector />
    </div>
  );
}
