'use client';
import { useEffect, useState } from 'react';
import { useGame } from '@/lib/store';
import { attachAudioUnlock, isMuted, music, rain, engine, setMuted, sfx, unlockAudio, type ThemeId } from '@/lib/audio';
import { CREW_ORDER } from '@/lib/types';
import { GOAL_PRICE, START_PRICE } from '@/lib/PriceSystem';

const themeFor = (s: ReturnType<typeof useGame.getState>): ThemeId => {
  if (s.screen === 'menu') return 'menu';
  if (s.toBeContinued) return 'victory';
  if (s.cutscene?.id === 'ending') return 'victory';
  if (s.cutscene?.id === 'grave' || s.tweet) return 'grave';
  if (s.gameOver) return 'grave';
  if (s.mode === 'survival') return s.free ? 'city' : 'survival';
  if (s.level === 5 && s.mode !== 'survival' && s.fight.phase >= 1) return 'battle';   // the boss fight proper
  const map: Record<number, ThemeId> = { 1: 'city', 2: 'stealth', 3: 'brawl', 4: 'race', 5: 'duel' };
  return map[s.level as number] ?? 'city';
};

/**
 * Listens to the game store and plays music + sound effects. Mounted once in <GameRoot/>.
 * Scene-specific one-shots (punch whoosh, hits, engine...) are triggered where they happen.
 */
export default function AudioDirector() {
  useEffect(() => {
    const off = attachAudioUnlock();
    music.play(themeFor(useGame.getState()));
    const unsub = useGame.subscribe((s, p) => {
      // ---- music follows the scene
      const th = themeFor(s);
      if (th !== music.current()) music.play(th);
      if (s.screen !== p.screen && s.screen === 'menu') { engine.stop(); rain.stop(); }
      if (s.cutscene?.id === 'ending' && p.cutscene?.id !== 'ending') rain.setVol(0.015);   // the storm calms for the ending
      if (s.level !== p.level || s.levelKey !== p.levelKey || s.screen !== p.screen) {
        if (s.screen !== 'game' || s.level !== 4 || s.mode === 'survival') engine.stop();
        if (s.screen !== 'game' || s.level !== 5) rain.stop();
      }

      // ---- level start sting, prompts, objectives
      if (s.screen === 'game' && (s.levelKey !== p.levelKey || p.screen !== 'game')) sfx.levelStart();
      if (s.prompt && !p.prompt) sfx.prompt();
      if (s.objective && s.objective !== p.objective && s.screen === 'game') sfx.objective();
      // ---- survival
      if (s.survival.kills > p.survival.kills) sfx.kill();
      if (s.survival.wave > p.survival.wave && s.survival.wave > 0) sfx.waveStart();
      if (s.banner === 'WAVE CLEARED' && p.banner !== 'WAVE CLEARED') sfx.waveClear();
      if (s.banner && /FINISH!|CEX LISTED/.test(s.banner) && s.banner !== p.banner) sfx.finishLine();
      // ---- price
      if (s.price !== p.price) {
        const k = Math.max(0, Math.min(1, Math.log10(Math.max(s.price, START_PRICE) / START_PRICE) / Math.log10(GOAL_PRICE / START_PRICE)));
        if (s.price > p.price) sfx.pumpTick(k); else sfx.dumpTick();
      }
      // ---- toasts / banners
      if (s.toasts.length > p.toasts.length) sfx.toast(s.toasts[s.toasts.length - 1].tone);
      if (s.banner && s.banner !== p.banner) {
        if (s.banner === '3' || s.banner === '2' || s.banner === '1') sfx.countdown(false);
        else if (s.banner === 'GO!') sfx.countdown(true);
        else if (/MEAST/.test(s.banner)) { /* MEAST MODE has its own sound */ }
        else sfx.banner();
      }
      // ---- crew / story
      if (CREW_ORDER.filter((c) => s.crew[c]).length > CREW_ORDER.filter((c) => p.crew[c]).length) sfx.recruit();
      if (s.dialogue && !p.dialogue) sfx.blip(1.2);
      if (s.cutscene && !p.cutscene) sfx.stinger();
      if (s.gameOver && !p.gameOver) { sfx.boom(); sfx.gameOver(); }
      if (s.minigame && !p.minigame) sfx.popup();
      if (s.orbsGot > p.orbsGot) sfx.coin();
      if (s.freed > p.freed) sfx.freed();
      if (s.tweet && !p.tweet) sfx.notify();
      if (s.toBeContinued && !p.toBeContinued) sfx.win();
      if (s.livestream && !p.livestream) sfx.notify();

      // ---- stealth meter thresholds
      if (s.stealth >= 60 && p.stealth < 60) sfx.alarm();
      else if (s.stealth >= 22 && p.stealth < 22) sfx.caution();
      // ---- QTE
      if (s.qte && (!p.qte || s.qte.progress > p.qte.progress)) { if (p.qte && s.qte.progress >= 1) sfx.qteDone(); else sfx.qteTick(); }
      if (!s.qte && p.qte && p.qte.progress >= 0.99) sfx.qteDone();

      // ---- fights
      const f = s.fight, pf = p.fight;
      if (f.hp < pf.hp && f.hp > 0 && pf.hp > 0) sfx.hurt();
      if (s.screen === 'game' && f.hp > 0 && f.maxHp > 0 && f.hp / f.maxHp < 0.25 && (s.level === 3 || s.level === 5)) sfx.heartbeat();
      if (f.foes.length && pf.foes.length) {
        const a = f.foes.reduce((t, b) => t + b.hp, 0), b = pf.foes.reduce((t, x) => t + x.hp, 0);
        if (a < b) sfx.hit(b - a >= 20);
      }
      if (f.meastLeft > 0 && pf.meastLeft <= 0) sfx.meastMode();
      if (f.phase !== pf.phase && f.phase > 1) sfx.stinger();
      // ---- race
      if (s.race.close > p.race.close) sfx.warn();
    });
    return () => { unsub(); off(); music.stop(); engine.stop(); rain.stop(); };
  }, []);
  return null;
}

/** Small speaker button (works on menu + in game). */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [m, setM] = useState(false);
  useEffect(() => { setM(isMuted()); }, []);
  return (
    <button
      data-ui aria-label={m ? 'Unmute' : 'Mute'}
      className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/55 text-base text-white backdrop-blur active:scale-90 ${className}`}
      onPointerDown={(e) => { e.stopPropagation(); }}
      onClick={() => { unlockAudio(); const n = !isMuted(); setMuted(n); setM(n); if (!n) sfx.click(); }}
    >{m ? '🔇' : '🔊'}</button>
  );
}
