'use client';
import { useEffect, useState } from 'react';
import { useGame, BUILT_LEVELS, type Candle } from '@/lib/store';
import { CREW_INFO, CREW_ORDER } from '@/lib/types';
import { formatCap, formatPrice, GOAL_PRICE, START_PRICE, isDistrictUnlocked, marketCap } from '@/lib/PriceSystem';
import { DISTRICTS } from '@/game/data/districts';
import { press, type PressName } from '@/lib/input';
import { isMobilePlay } from '@/lib/orientation';
import DialogueBox from '@/components/DialogueBox';
import MiniMap from '@/components/MiniMap';
import FullMap from '@/components/FullMap';
import HackMinigame from '@/components/overlays/HackMinigame';
import DumpPuzzle from '@/components/overlays/DumpPuzzle';
import PolLivestream from '@/components/overlays/PolLivestream';
import SqueezePuzzle from '@/components/overlays/SqueezePuzzle';
import { SoundToggle } from '@/components/AudioDirector';

function CandleChart({ candles, flashKey }: { candles: Candle[]; flashKey: number }) {
  const W = 96, H = 38;
  const view = candles.slice(-16);
  const lo = Math.min(...view.map((c) => c.l));
  const hi = Math.max(...view.map((c) => c.h));
  const span = Math.max(hi - lo, hi * 0.02, 1e-9);
  const y = (v: number) => H - 2 - ((v - lo) / span) * (H - 4);
  const bw = W / 16;
  return (
    <svg width={W} height={H} className="shrink-0">
      {view.map((c, i) => {
        const up = c.c >= c.o;
        const col = up ? '#39ff88' : '#ff2d55';
        const x = i * bw + bw / 2;
        const last = i === view.length - 1;
        return (
          <g key={i} className={last ? 'candle-live' : ''} style={last ? { filter: `drop-shadow(0 0 4px ${col})` } : undefined}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
            <rect x={x - bw * 0.3} width={bw * 0.6} y={Math.min(y(c.o), y(c.c))} height={Math.max(2, Math.abs(y(c.o) - y(c.c)))} fill={col}
              key={last ? flashKey : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

function Stars({ n }: { n: number }) {
  return <div className="flex justify-end gap-[1px]">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`gta-star text-[14px] leading-none ${i < n ? 'on' : ''}`}>★</span>)}</div>;
}

/** Weapon / vehicle slot, GTA style: icon in a rounded box, ammo or speed in the corner. */
function WeaponBox() {
  const level = useGame((s) => s.level);
  const f = useGame((s) => s.fight);
  const v = useGame((s) => s.survival);
  const mode = useGame((s) => s.mode);
  const r = useGame((s) => s.race);
  let icon = '👊', sub = '';
  if (mode === 'survival' && f.stage === 'DRIVING') { icon = '🏎'; sub = String(r.kmh); }
  else if (level === 4) { icon = '🏎'; sub = String(r.kmh); }
  else if (level === 5 && f.gun) { icon = mode === 'survival' ? (v.arms[v.cur]?.icon ?? '🔫') : '🔫'; sub = f.reload ? '…' : String(f.ammo); }
  return (
    <div className="relative flex h-[56px] w-[56px] items-center justify-center rounded-xl border-2 border-white/80 bg-black/55 shadow-[0_2px_8px_rgba(0,0,0,.6)] backdrop-blur">
      <span className="icon-white text-[30px] leading-none">{icon}</span>
      {sub && <span className="gta-text absolute -bottom-1 right-0.5 text-[12px] leading-none">{sub}</span>}
    </div>
  );
}

/** Top-right cluster: money-style price (or kill count), weapon box + stars, mini chart, crew row. */
function TopRight() {
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const price = useGame((s) => s.price);
  const candles = useGame((s) => s.candles);
  const flash = useGame((s) => s.flash);
  const flashAt = useGame((s) => s.flashAt);
  const crew = useGame((s) => s.crew);
  const sv = useGame((s) => s.survival);
  const surv = mode === 'survival';
  const free = useGame((s) => s.free);
  const up = flash !== 'down';
  const prog = Math.max(0, Math.min(1, Math.log10(Math.max(price, START_PRICE) / START_PRICE) / Math.log10(GOAL_PRICE / START_PRICE)));

  useEffect(() => {
    if (surv) return;
    const id = setInterval(() => useGame.getState().newCandle(), 900);
    return () => clearInterval(id);
  }, [surv]);

  const stars = surv ? (free ? sv.wanted : Math.min(5, Math.ceil(sv.wave / 3))) : level;
  return (
    <div className="pointer-events-none absolute right-2 top-[max(8px,env(safe-area-inset-top))] flex flex-col items-end gap-1.5">
      <div className="flex items-start gap-2">
        <div className="pt-0.5 text-right">
          {surv ? (<>
            <div className="gta-text text-[34px] leading-[1]">{sv.kills}</div>
            <div className="gta-text text-[10px] tracking-widest text-white/80">{`KILLS · WAVE ${sv.wave || '–'}`}</div>
            <div className="gta-text text-[10px] tracking-widest text-amber-300">BEST {Math.max(sv.best, sv.kills)}</div>
            <div className="gta-text text-[10px] tracking-widest text-neon">SCORE {sv.score}</div>
            {sv.combo >= 2 && (
              <div key={sv.combo} className="mt-1 flex flex-col items-end combo-pop">
                <div className="font-game text-[26px] leading-none text-amber-300 drop-shadow-[0_0_10px_#ff9d2e]">x{sv.mult.toFixed(1)}</div>
                <div className="gta-text text-[10px] tracking-widest text-white">{sv.combo} COMBO</div>
                <div className="mt-0.5 h-1 w-[84px] overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-amber-300" style={{ width: `${sv.comboT * 100}%` }} /></div>
              </div>
            )}
          </>) : (<>
            <div key={flashAt} className={`gta-text ${up ? 'up price-up' : 'down price-down'} text-[30px] leading-[1]`}>{formatPrice(price)}</div>
            <div className="gta-text text-[10px] tracking-widest text-white/80">MCAP {formatCap(marketCap(price))}</div>
          </>)}
        </div>
        <div className="flex flex-col items-end gap-1">
          <WeaponBox />
          <Stars n={stars} />
          {surv && free && stars > 0 && <div className="gta-text text-[9px] tracking-[0.3em] text-rug animate-pulse">WANTED</div>}
        </div>
      </div>
      {!surv && (
        <div className="hud-glass w-[168px] rounded-lg px-2 py-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] tracking-[0.2em] text-white/60">FAPCOIN</span>
            <CandleChart candles={candles} flashKey={flashAt} />
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-fap to-neon" style={{ width: `${prog * 100}%`, transition: 'width .3s' }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[7px] text-white/40"><span>$0.01</span><span>$1000</span></div>
        </div>
      )}
      {!surv && (
        <div className="flex gap-1">
          {CREW_ORDER.map((id) => {
            const on = crew[id];
            return (
              <div key={id} title={CREW_INFO[id].name} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] ${on ? '' : 'grayscale'}`}
                style={{ borderColor: on ? CREW_INFO[id].color : '#444', background: on ? CREW_INFO[id].color + '33' : '#15151c', opacity: on ? 1 : 0.5 }}>
                {CREW_INFO[id].emoji}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MapPanel({ onClose }: { onClose: () => void }) {
  const peak = useGame((s) => s.peakPrice);
  return (
    <div data-ui className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onPointerDown={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#0d0a1c] p-4" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-game text-lg text-white">FAP CITY</div>
        <div className="mb-3 text-[11px] text-white/50">Districts unlock as FAPCOIN pumps.</div>
        {DISTRICTS.map((d) => {
          const open = isDistrictUnlocked(d.id, peak);
          return (
            <div key={d.id} className={`mb-2 rounded-xl border p-2.5 ${open ? 'border-fap/50 bg-fap/10' : 'border-white/10 bg-white/5 opacity-70'}`}>
              <div className="flex items-center justify-between">
                <div className="font-game text-sm text-white">{open ? '🔓' : '🔒'} D{d.id} · {d.name}</div>
                <div className="text-[11px] text-white/60">{formatPrice(d.unlockPrice)}</div>
              </div>
              <div className="text-[11px] text-white/60">{d.tagline}</div>
            </div>
          );
        })}
        <button className="mt-1 w-full rounded-lg bg-white/10 py-2 text-sm text-white" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function CutsceneOverlay() {
  const cs = useGame((s) => s.cutscene);
  const caption = useGame((s) => s.caption);
  if (!cs) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-x-0 top-0 h-[11%] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-black" />
      {caption && (
        <div key={caption} className="fade-in absolute inset-x-0 bottom-[3%] px-5 text-center font-game text-[15px] leading-snug text-white drop-shadow-[0_2px_4px_#000]">{caption}</div>
      )}
      <button data-ui className="pointer-events-auto absolute right-3 top-[calc(11%+8px)] rounded-full bg-white/15 px-3 py-1 text-xs text-white"
        onClick={() => useGame.getState().endCutscene()}>SKIP ▶▶</button>
    </div>
  );
}

function LevelIntro() {
  const level = useGame((s) => s.level);
  const t = useGame((s) => s.levelIntro);
  const mode = useGame((s) => s.mode);
  const free = useGame((s) => s.free);
  const [show, setShow] = useState(true);
  useEffect(() => { setShow(true); const id = setTimeout(() => setShow(false), 3200); return () => clearTimeout(id); }, [t]);
  if (!show) return null;
  if (mode === 'survival') return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center fade-out-slow">
      <div className="font-game text-xs tracking-[0.5em] text-neon">{free ? 'THE CITY IS OPEN · ENDLESS WAVES' : 'ONLY KILLS COUNT'}</div>
      <div className="font-game text-4xl text-white drop-shadow-[0_0_14px_#ff2d55]">{free ? 'FREE PLAY' : 'SURVIVAL'}</div>
    </div>
  );
  const names = ['', 'RECRUIT', 'CAPTIVE & DUMP', 'BEARS', 'RED CANDLE RACE', 'FINAL DUEL'];
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center fade-out-slow">
      <div className="font-game text-xs tracking-[0.5em] text-neon">LEVEL {level}</div>
      <div className="font-game text-4xl text-white drop-shadow-[0_0_14px_#ff4fd8]">{names[level]}</div>
    </div>
  );
}

function Level2Hud() {
  const level = useGame((s) => s.level);
  const stealth = useGame((s) => s.stealth);
  const freed = useGame((s) => s.freed);
  const qte = useGame((s) => s.qte);
  if (level !== 2) return null;
  const col = stealth >= 60 ? '#ff2d55' : stealth >= 22 ? '#fbbf24' : '#39ff88';
  return (<>
    <div className="hud-glass absolute left-2 top-[164px] w-[44%] max-w-[170px] rounded-lg px-2 py-1.5">
      <div className="flex justify-between text-[9px] tracking-widest text-white/70"><span>👁 STEALTH</span><span style={{ color: col }}>{stealth >= 60 ? 'ALERT' : stealth >= 22 ? 'SUSPICIOUS' : 'HIDDEN'}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${stealth}%`, background: col, transition: 'width .1s' }} /></div>
      <div className="mt-1.5 text-[10px] text-white/80">OGs FREED <b className="text-fap">{freed}</b>/200</div>
    </div>
    {qte && (
      <div className="absolute inset-x-0 bottom-[30%] flex flex-col items-center">
        <div className="font-game text-xs tracking-wider text-amber-300 drop-shadow">{qte.label}</div>
        <div className="mt-1 h-3 w-60 overflow-hidden rounded-full border border-white/40 bg-black/60">
          <div className="h-full bg-gradient-to-r from-amber-400 to-rug" style={{ width: `${qte.progress * 100}%` }} />
        </div>
      </div>
    )}
  </>);
}

/** Survival weapon bar: owned weapons are tappable, locked ones are dimmed (keys 1-5, Q/X/Tab/wheel to swap). */
function WeaponBar() {
  const v = useGame((s) => s.survival);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(isMobilePlay()); }, []);
  if (mobile || !v.arms.length) return null;      // phones swap with the SWAP button instead
  return (
    <div className="pointer-events-none absolute left-2 top-[250px] flex w-[96px] flex-col gap-1">
      {v.arms.map((a, i) => {
        const cur = i === v.cur;
        return (
          <button key={a.id} data-ui disabled={!a.has}
            className={`pointer-events-auto flex items-center justify-between rounded-md border px-1.5 py-1 text-left backdrop-blur ${cur ? 'bg-black/80' : 'bg-black/45'} ${a.has ? '' : 'opacity-30'}`}
            style={{ borderColor: cur ? a.color : 'rgba(255,255,255,0.15)', boxShadow: cur ? `0 0 10px ${a.color}88` : undefined }}
            onClick={() => press(`slot${i + 1}` as PressName)}>
            <span className="text-[11px]">{i + 1} {a.icon}</span>
            <span className="text-[9px] tracking-wider" style={{ color: a.has ? a.color : '#888' }}>{a.has ? (a.reserve < 0 ? `${a.mag}·∞` : `${a.mag}·${a.reserve}`) : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

function FightHud() {
  const level = useGame((s) => s.level);
  const f = useGame((s) => s.fight);
  const smode = useGame((s) => s.mode);
  if (level !== 3 && level !== 5) return null;
  const duel = level === 5;
  const ready = f.rage >= 100 && f.meastLeft <= 0;
  const mode = f.meastLeft > 0;
  return (<>
    <div className="hud-glass absolute left-2 top-[164px] w-[46%] max-w-[180px] rounded-lg px-2 py-1.5">
      {!duel && <>
      <div className="flex justify-between text-[9px] tracking-widest text-white/70"><span>💢 RAGE</span><span className={ready ? 'text-amber-300' : ''}>{mode ? `MEAST MODE ${f.meastLeft.toFixed(1)}s` : ready ? 'READY — Q' : `${f.rage}%`}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${ready || mode ? 'bg-amber-300' : 'bg-orange-500'}`} style={{ width: `${mode ? (f.meastLeft / 5) * 100 : f.rage}%`, transition: 'width .12s' }} /></div>
      <div className="mt-1.5 text-[9px] tracking-widest text-white/70">💪 MEAST</div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-500" style={{ width: `${f.ally * 100}%` }} /></div>
      </>}
      {duel && <div className="text-[9px] tracking-widest text-neon">{f.stage === 'RUGPULL' ? `RUGPULL · PHASE ${f.phase || 1} / 3 · ${['', 'GUNFIGHT', 'THE KNIFE', 'THE CHAIN'][f.phase || 1]}` : f.stage}</div>}
      {duel && f.gun && (
        <div className="mt-1.5 flex items-center justify-between text-[10px] tracking-widest text-white/80">
          <span>🔫 {f.weapon}</span>
          <span className={f.reload || f.ammo === 0 ? 'animate-pulse text-amber-300' : ''}>{f.reload ? 'RELOADING…' : `${f.ammo} / ${f.mag}${f.reserve >= 0 ? ` · ${f.reserve}` : ' · ∞'}`}</span>
        </div>
      )}
    </div>
    {duel && smode === 'survival' && <WeaponBar />}
    {duel && f.prompt && (
      <div className="absolute inset-x-0 top-[40%] text-center font-game text-2xl text-rug drop-shadow-[0_0_12px_#ff2d55] animate-pulse">{f.prompt}</div>
    )}
    {f.foes.length > 0 && (
      <div className="absolute right-2 top-[172px] flex w-[42%] max-w-[170px] flex-col gap-1">
        {f.foes.map((b) => (
          <div key={b.id} className={b.hp <= 0 ? 'opacity-30' : ''}>
            <div className="text-center text-[8px] tracking-widest text-rug">{b.name}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/60"><div className="h-full rounded-full bg-rug" style={{ width: `${(b.hp / b.max) * 100}%`, transition: 'width .15s' }} /></div>
          </div>
        ))}
      </div>
    )}
    {!duel && ready && (
      <button data-ui className="pointer-events-auto absolute inset-x-0 bottom-[38%] mx-auto w-fit animate-pulse rounded-full border-2 border-amber-300 bg-black/70 px-5 py-2 font-game text-sm text-amber-300 shadow-[0_0_20px_#fbbf24aa]"
        onClick={() => press('special')}>MEAST MODE (Q)</button>
    )}
  </>);
}

function RaceHud() {
  const level = useGame((s) => s.level);
  const r = useGame((s) => s.race);
  const qte = useGame((s) => s.qte);
  if (level !== 4) return null;
  const ord = ['', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH'][r.pos] ?? `${r.pos}TH`;
  return (<>
    <div className="hud-glass absolute left-2 top-[10px] w-[46%] max-w-[190px] rounded-lg px-2 py-1.5">
      <div className="flex items-end justify-between"><span className="font-game text-2xl leading-none text-fap">{ord}</span><span className="text-[9px] tracking-widest text-white/60">/ {r.total}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-neon" style={{ width: `${r.dist * 100}%` }} /></div>
      <div className="mt-1.5 flex justify-between text-[9px] tracking-widest text-white/70"><span>⚡ BOOST</span><span>{r.boost}%</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-fap" style={{ width: `${r.boost}%` }} /></div>
      <div className="mt-1.5 flex justify-between text-[9px] tracking-widest text-white/70"><span>🛢 BARREL (B)</span><span>{r.barrel >= 100 ? 'READY' : '…'}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400" style={{ width: `${r.barrel}%` }} /></div>
    </div>
    {r.warn && !qte && (
      <div className="absolute inset-x-0 top-[26%] text-center font-game text-lg text-amber-300 drop-shadow-[0_0_10px_#f59e0b] animate-pulse">⚠ ONCOMING CAR — CHANGE LANE!</div>
    )}
    {r.close > 0 && !qte && (
      <div className="absolute inset-x-0 top-[34%] text-center font-game text-sm text-rug drop-shadow animate-pulse">🔴 RED CANDLE ON YOU  −{r.close * 2}%/s</div>
    )}
    {qte && (
      <div className="absolute inset-x-0 bottom-[30%] flex flex-col items-center">
        <div className="font-game text-xs tracking-wider text-amber-300 drop-shadow">{qte.label}</div>
        <div className="mt-1 h-3 w-60 overflow-hidden rounded-full border border-white/40 bg-black/60"><div className="h-full bg-gradient-to-r from-neon to-fap" style={{ width: `${qte.progress * 100}%` }} /></div>
      </div>
    )}
  </>);
}

function TweetCard() {
  const on = useGame((s) => s.tweet);
  const [likes, setLikes] = useState(0);
  useEffect(() => {
    if (!on) { setLikes(0); return; }
    const id = setInterval(() => setLikes((l) => l + Math.floor(900 + Math.random() * 2600)), 120);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-5 fade-in">
      <div className="w-full max-w-xs rounded-2xl border border-white/20 bg-[#0b0f14] p-4 text-left">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fap/20 text-xl">🟢</div>
          <div><div className="text-sm font-bold text-white">Satoshi Shitoshi</div><div className="text-xs text-white/50">@satoshi_shitoshi · now</div></div>
        </div>
        <div className="mt-3 font-game text-4xl text-white">fixed.</div>
        <div className="mt-3 flex gap-4 text-xs text-white/50"><span>♥ {likes.toLocaleString()}</span><span>🔁 {Math.round(likes / 3).toLocaleString()}</span></div>
      </div>
    </div>
  );
}

function GameOver() {
  const over = useGame((s) => s.gameOver);
  const mode = useGame((s) => s.mode);
  const sv = useGame((s) => s.survival);
  const name = useGame((s) => s.playerName);
  const free = useGame((s) => s.free);
  if (!over) return null;
  if (mode === 'survival') {
    const record = sv.kills > 0 && sv.kills >= sv.best;
    return (
      <div data-ui className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-5 text-center fade-in">
        <div>
          <div className="font-game text-5xl text-rug drop-shadow-[0_0_14px_#ff2d55]">{over}</div>
          <div className="mt-3 text-xs tracking-[0.3em] text-white/60">{(name || 'JACK').toUpperCase()}</div>
          <div className="font-game text-6xl text-white">{sv.kills}</div>
          <div className="text-xs tracking-[0.3em] text-white/60">KILLS · WAVE {sv.wave}</div>
          <div className="mt-1 text-xs tracking-[0.2em] text-neon">SCORE {sv.score} · BEST COMBO {sv.bestCombo}</div>
          <div className={`mt-2 text-sm ${record ? 'animate-pulse text-amber-300' : 'text-white/60'}`}>{record ? 'NEW PERSONAL BEST!' : `Best: ${sv.best}`}</div>
          <div className="mt-5 flex gap-3">
            <button className="rounded-xl bg-white/10 px-6 py-3 font-game text-white" onClick={() => useGame.getState().toMenu()}>MENU</button>
            <button className="rounded-xl bg-fap px-6 py-3 font-game text-black" onClick={() => useGame.getState().retry()}>AGAIN</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-ui className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-5 text-center fade-in">
      <div>
        <div className="font-game text-5xl text-rug drop-shadow-[0_0_14px_#ff2d55]">{over}</div>
        <div className="mt-2 text-sm text-white/70">{over.endsWith('PLACE') ? 'CEX only lists the race winner. Run it again — you need 1ST.' : 'FAPCOIN dips... but never dies.'}</div>
        <div className="mt-5 flex gap-3">
          <button className="rounded-xl bg-white/10 px-6 py-3 font-game text-white" onClick={() => useGame.getState().toMenu()}>MENU</button>
          <button className="rounded-xl bg-fap px-6 py-3 font-game text-black" onClick={() => useGame.getState().retry()}>RETRY</button>
        </div>
      </div>
    </div>
  );
}

function ToBeContinued() {
  const tbc = useGame((s) => s.toBeContinued);
  const done = BUILT_LEVELS >= 5;
  const price = useGame((s) => s.price);
  const crew = useGame((s) => s.crew);
  if (!tbc) return null;
  return (
    <div data-ui className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-5 text-center">
      <div className="max-w-sm">
        <div className="font-game text-3xl text-fap">{done ? 'THE END' : `LEVEL ${BUILT_LEVELS} COMPLETE`}</div>
        <div className="mt-2 text-white/80">All six crew recruited ({CREW_ORDER.filter((c) => crew[c]).length}/6). FAPCOIN: {formatPrice(price)}</div>
        {done ? (
          <div className="mt-4 rounded-xl border border-fap/40 bg-fap/10 p-3 text-sm text-fap">FAPCOIN: $0.01 → $1,000. Market cap $1B. The culture is fixed.<br />Thanks for playing FAP THEFT AUTO.</div>
        ) : (
        <div className="mt-4 rounded-xl border border-pink/40 bg-pink/10 p-3 text-sm text-pink">
          Next up: Level {BUILT_LEVELS + 1} — {['', 'RECRUIT', 'CAPTIVE & DUMP', 'BEARS', 'RED CANDLE RACE', 'FINAL DUEL'][BUILT_LEVELS + 1] ?? 'THE END'}.<br />(The rest are the next build drops.)
        </div>)}
        <div className="mt-5 flex gap-3">
          <button className="flex-1 rounded-xl bg-white/10 py-3 font-game text-white" onClick={() => useGame.getState().toMenu()}>MENU</button>
          <button className="flex-1 rounded-xl bg-fap py-3 font-game text-black" onClick={() => useGame.getState().startGame(1, true)}>REPLAY</button>
        </div>
      </div>
    </div>
  );
}

export default function HUD() {
  const objective = useGame((s) => s.objective);
  const prompt = useGame((s) => s.prompt);
  const toasts = useGame((s) => s.toasts);
  const banner = useGame((s) => s.banner);
  const cutscene = useGame((s) => s.cutscene);
  const minigame = useGame((s) => s.minigame);
  const noViolence = useGame((s) => s.noViolence);
  const level = useGame((s) => s.level);
  const mode0 = useGame((s) => s.mode);
  const [map, setMap] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  // any open map pauses the game; Esc / P toggles the pause map on desktop
  useEffect(() => { useGame.getState().setPaused(map || bigMap); }, [map, bigMap]);
  useEffect(() => () => useGame.getState().setPaused(false), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'KeyP' || e.code === 'Escape') setBigMap((b) => !b); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {!cutscene && <TopRight />}
      {!cutscene && !minigame && level !== 4 && <MiniMap onOpen={() => setBigMap(true)} />}
      {!cutscene && <SoundToggle className="absolute left-[132px] top-[max(8px,env(safe-area-inset-top))]" />}
      {!cutscene && level === 1 && mode0 !== 'survival' && (
        <button data-ui aria-label="Districts map" className="pointer-events-auto absolute left-2 top-[164px] flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/70 bg-black/55 text-xl shadow-[0_2px_8px_rgba(0,0,0,.6)] backdrop-blur active:scale-90" onClick={() => setMap(true)}><span className="icon-white">📱</span></button>
      )}
      {!cutscene && noViolence && (
        <div className="absolute left-[60px] top-[172px] rounded-lg bg-rug/85 px-2.5 py-1 font-game text-[10px] text-white">NO-VIOLENCE ZONE</div>
      )}
      {!cutscene && objective && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-14 [@media(pointer:coarse)]:bottom-[192px]">
          <div className="gta-text max-w-md text-center text-[13px] leading-tight"><span className="mr-1 text-[#f7c948]">▶</span>{objective}</div>
        </div>
      )}

      {/* toasts */}
      <div className="absolute inset-x-0 top-[400px] flex flex-col items-center gap-1.5">
        {toasts.map((t) => (
          <div key={t.id} className={`fade-in rounded-full px-4 py-1.5 text-xs font-bold text-black ${t.tone === 'good' ? 'bg-fap' : t.tone === 'bad' ? 'bg-rug text-white' : 'bg-neon'}`}>{t.text}</div>
        ))}
      </div>

      {/* interact prompt (tap it on mobile) */}
      {prompt && !cutscene && !minigame && (
        <div className="absolute inset-x-0 bottom-[34%] flex justify-center">
          <button data-ui className="pointer-events-auto fade-in rounded-full border-2 border-fap bg-black/70 px-5 py-2 font-game text-sm text-fap shadow-[0_0_18px_#39ff8866]"
            onClick={() => press('interact')}>[E] {prompt}</button>
        </div>
      )}

      {banner && (
        <div className="absolute inset-x-0 top-[38%] text-center font-game text-4xl text-fap drop-shadow-[0_0_16px_#39ff88] banner-pop">{banner}</div>
      )}

      {!cutscene && <Level2Hud />}
      {!cutscene && <FightHud />}
      {!cutscene && <RaceHud />}
      <CutsceneOverlay />
      <LevelIntro />
      <DialogueBox />
      {minigame === 'hack' && <div className="pointer-events-auto"><HackMinigame /></div>}
      {minigame === 'dump' && <div className="pointer-events-auto"><DumpPuzzle /></div>}
      {minigame === 'squeeze' && <SqueezePuzzle />}
      {!cutscene && <PolLivestream />}
      <TweetCard />
      <GameOver />
      {map && <div className="pointer-events-auto"><MapPanel onClose={() => setMap(false)} /></div>}
      {bigMap && <FullMap onClose={() => setBigMap(false)} />}
      <ToBeContinued />
    </div>
  );
}
