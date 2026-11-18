'use client';
import { transitionTo } from '@/lib/transition';
import { useEffect, useState } from 'react';
import { useGame } from '@/lib/store';
import { telegramUser } from '@/lib/telegram';
import { BUILT_LEVELS, loadPlayerName, loadSurvivalBest } from '@/lib/store';
import { formatPrice } from '@/lib/PriceSystem';
import { SoundToggle } from '@/components/AudioDirector';
import { sfx, unlockAudio } from '@/lib/audio';
import { cycleQuality, useQuality } from '@/lib/quality';

const CHAPTERS = ['RECRUIT', 'CAPTIVE & DUMP', 'BEARS', 'RED CANDLE RACE', 'FINAL DUEL'];

export default function MainMenu() {
  const hasSave = useGame((s) => s.hasSave);
  const save = useGame((s) => s.save);
  const playerName = useGame((s) => s.playerName);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [best, setBest] = useState(0);
  const [chapters, setChapters] = useState(false);
  const gfx = useQuality();
  useEffect(() => {
    const saved = loadPlayerName();
    if (saved) useGame.getState().setPlayerName(saved);
    else setDraft(telegramUser() ?? '');
    setBest(loadSurvivalBest());
    setReady(true);
  }, []);
  const needName = ready && !playerName;
  const saveName = () => {
    if (!draft.trim()) return;
    unlockAudio(); sfx.select();
    useGame.getState().setPlayerName(draft); setEditing(false);
  };
  const start = (...a: Parameters<ReturnType<typeof useGame.getState>['startGame']>) => { unlockAudio(); sfx.select(); transitionTo(() => useGame.getState().startGame(...a)); };

  return (
    <div className="menu-bg absolute inset-0 flex flex-col items-center justify-between overflow-y-auto p-6 text-center" data-ui>
      <SoundToggle className="absolute right-3 top-[max(12px,env(safe-area-inset-top))]" />
      <button className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] rounded-lg border border-white/20 bg-black/40 px-2 py-1 font-game text-[10px] tracking-widest text-white/80"
        onClick={() => { unlockAudio(); sfx.click(); cycleQuality(); }}>GFX: {gfx.toUpperCase()}</button>
      <div className="pt-[max(24px,env(safe-area-inset-top))]">
        <div className="font-game text-[11px] tracking-[0.5em] text-neon">{playerName ? `WELCOME ${playerName.toUpperCase()}` : 'A CRYPTO HEIST'}</div>
        <h1 className="title-logo mt-3 font-game text-[44px] italic leading-[0.95]">FAP<br />THEFT<br />AUTO</h1>
        <div className="mt-2 font-game text-sm tracking-[0.6em] text-pink">( FTA )</div>
        {playerName && !editing && (
          <button className="mt-1 text-[10px] tracking-widest text-white/40 underline" onClick={() => { sfx.click(); setDraft(playerName); setEditing(true); }}>✎ CHANGE NAME</button>
        )}
        <p className="mx-auto mt-5 max-w-xs text-[13px] leading-snug text-white/70">
          FAPCOIN was abandoned by Satoshi Shitoshi and rugged by Rugpull. Take it from <b className="text-fap">$0.01</b> to <b className="text-fap">$1000</b> and a <b className="text-fap">$1B</b> market cap.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3 py-6">
        {hasSave && save && (
          <button className="w-full rounded-2xl bg-fap py-4 font-game text-lg text-black shadow-[0_0_24px_#39ff8888] active:scale-95"
            onClick={() => start(Math.min(save.level, BUILT_LEVELS) as 1)}>
            CONTINUE <span className="text-xs opacity-70">· L{Math.min(save.level, BUILT_LEVELS)} · {formatPrice(save.peak)}</span>
          </button>
        )}
        <button className={`w-full rounded-2xl py-4 font-game text-lg active:scale-95 ${hasSave ? 'bg-white/10 text-white' : 'bg-fap text-black shadow-[0_0_24px_#39ff8888]'}`}
          onClick={() => start(1, true)}>NEW GAME</button>
        <button className="w-full rounded-2xl border border-white/20 py-3 font-game text-sm text-white/80" onClick={() => { unlockAudio(); sfx.click(); setChapters((c) => !c); }}>CHAPTERS</button>
        <button className="w-full rounded-2xl border border-rug/60 bg-rug/10 py-3 font-game text-sm text-rug active:scale-95"
          onClick={() => { unlockAudio(); sfx.select(); transitionTo(() => useGame.getState().startSurvival()); }}>
          SURVIVAL <span className="text-xs opacity-70">· only kills count{best > 0 ? ` · best ${best}` : ''}</span>
        </button>
        <button className="w-full rounded-2xl border border-neon/60 bg-neon/10 py-3 font-game text-sm text-neon active:scale-95"
          onClick={() => { unlockAudio(); sfx.select(); transitionTo(() => useGame.getState().startFreePlay()); }}>
          FREE PLAY <span className="text-xs opacity-70">· drive · loot · clear the camps</span>
        </button>
        {chapters && (
          <div className="space-y-1.5 text-left">
            {CHAPTERS.map((c, i) => {
              const ok = i + 1 <= BUILT_LEVELS && (i === 0 || (save?.level ?? 1) >= i + 1);
              return (
                <button key={c} disabled={!ok} onClick={() => start((i + 1) as 1)}
                  className="flex w-full items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white disabled:opacity-40">
                  <span className="font-game">L{i + 1} · {c}</span>
                  <span className="text-xs">{i + 1 <= BUILT_LEVELS ? (ok ? '▶' : '🔒') : 'COMING SOON'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(needName || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          <form className="w-full max-w-xs rounded-2xl border border-neon/40 bg-[#10081f] p-5 text-center" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
            <div className="font-game text-xs tracking-[0.4em] text-neon">{editing ? 'CHANGE NAME' : 'WHO ARE YOU?'}</div>
            <div className="mt-1 font-game text-2xl text-white">ENTER YOUR NAME</div>
            <input autoFocus value={draft} maxLength={14} onChange={(e) => setDraft(e.target.value)} placeholder="Your name"
              className="mt-4 w-full rounded-xl border border-white/20 bg-black/50 px-4 py-3 text-center font-game text-lg text-white outline-none focus:border-fap" />
            <button type="submit" disabled={!draft.trim()} className="mt-4 w-full rounded-xl bg-fap py-3 font-game text-black disabled:opacity-40">{editing ? 'SAVE' : "LET'S GO"}</button>
            {editing && <button type="button" className="mt-2 text-xs text-white/50 underline" onClick={() => setEditing(false)}>cancel</button>}
          </form>
        </div>
      )}
      <div className="pb-[max(12px,env(safe-area-inset-bottom))] text-[10px] leading-tight text-white/40">
        Fake price. No real crypto. No wallets. Just vibes.<br />
        Desktop: WASD · mouse · E interact · J/click punch · Space jump · Shift run
      </div>
    </div>
  );
}
