import { create } from 'zustand';
import { PricePump, START_PRICE, LEVEL_START_PRICE } from '@/lib/PriceSystem';
import { cloudSave } from '@/lib/telegram';
import { CREW_ORDER, type CrewId, type LevelId } from '@/lib/types';
import { RECRUIT_QUESTS } from '@/game/data/quests';

/** Levels that exist in this build. Finishing the last one shows the "to be continued" card. */
export const BUILT_LEVELS = 5;

export interface DialogueLine { who: string; text: string; color?: string }
export interface Dialogue { lines: DialogueLine[]; onDone?: () => void }
export interface Toast { id: number; text: string; tone: 'good' | 'bad' | 'info' }
export interface Candle { o: number; h: number; l: number; c: number }
export type QuestStep = 'intro' | 'orbs' | 'infiltrate' | 'talk' | 'done';
export type Minigame = null | 'hack' | 'dump' | 'squeeze';
export interface BossBar { id: string; name: string; hp: number; max: number }
export interface FightHud { hp: number; maxHp: number; rage: number; meastLeft: number; foes: BossBar[]; ally: number; phase: number; prompt: string | null; stage: string; gun: boolean; ammo: number; mag: number; reload: boolean; weapon: string; reserve: number }
export interface RaceHud { pos: number; total: number; dist: number; boost: number; barrel: number; close: number; warn: boolean; kmh: number; crashes: number }
export const NO_RACE: RaceHud = { pos: 6, total: 6, dist: 0, boost: 100, barrel: 0, close: 0, warn: false, kmh: 0, crashes: 0 };
export const NO_FIGHT: FightHud = { hp: 100, maxHp: 100, rage: 0, meastLeft: 0, foes: [], ally: 1, phase: 0, prompt: null, stage: '', gun: false, ammo: 12, mag: 12, reload: false, weapon: 'PISTOL', reserve: -1 };
export interface ArmSlot { id: string; name: string; icon: string; color: string; has: boolean; mag: number; reserve: number }
export interface SurvivalHud { kills: number; wave: number; best: number; left: number; arms: ArmSlot[]; cur: number; combo: number; comboT: number; mult: number; bestCombo: number; score: number; wanted: number }
export const NO_SURVIVAL: SurvivalHud = { kills: 0, wave: 0, best: 0, left: 0, arms: [], cur: 0, combo: 0, comboT: 0, mult: 1, bestCombo: 0, score: 0, wanted: 0 };
const NAME_KEY = 'fta-player-name', BEST_KEY = 'fta-survival-best';
const lsGet = (k: string) => { try { return typeof window === 'undefined' ? null : window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } };
export const loadPlayerName = () => lsGet(NAME_KEY) ?? '';
export const loadSurvivalBest = () => Number(lsGet(BEST_KEY) ?? 0) || 0;
export const saveSurvivalBest = (n: number) => lsSet(BEST_KEY, String(n));
export const loadFreeBest = () => Number(lsGet('fta-free-best') ?? 0) || 0;
export const saveFreeBest = (n: number) => lsSet('fta-free-best', String(n));
export interface QTEState { label: string; progress: number }

export interface SaveData {
  level: LevelId;
  crew: Record<CrewId, boolean>;
  questIndex: number;
  introDone: boolean;
  peak: number;
}

const emptyCrew = (): Record<CrewId, boolean> =>
  CREW_ORDER.reduce((a, k) => ({ ...a, [k]: false }), {} as Record<CrewId, boolean>);

let cancelPump: (() => void) | null = null;
let toastId = 1;

interface GameState {
  screen: 'menu' | 'game';
  level: LevelId;
  levelKey: number;      // bump to remount the level scene
  levelIntro: number;    // Date.now() when the level title card should show
  hasSave: boolean;
  save: SaveData | null;

  price: number;
  peakPrice: number;
  candles: Candle[];
  flash: 'up' | 'down' | null;
  flashAt: number;

  crew: Record<CrewId, boolean>;
  questIndex: number;
  questStep: QuestStep;
  orbsGot: number;
  introDone: boolean;
  objective: string;
  prompt: string | null;

  dialogue: Dialogue | null;
  cutscene: { id: string; onDone?: () => void } | null;
  caption: string | null;
  minigame: Minigame;
  noViolence: boolean;
  banner: string | null;
  toasts: Toast[];
  gameOver: string | null;
  toBeContinued: boolean;
  freed: number;           // L2: OG holders freed (of 200)
  stealth: number;         // L2: stealth meter 0..100
  qte: QTEState | null;
  livestream: boolean;     // Pol's livestream overlay
  tweet: boolean;          // L5 ending: Satoshi Shitoshi's "fixed." tweet card
  race: RaceHud;           // L4: race HUD
  fight: FightHud;         // L3/L5: brawl HUD (hp, rage, MeastMode timer, enemy bars)
  playerName: string;
  mode: 'story' | 'survival';   // survival = endless waves on the rooftop, only kills count
  survival: SurvivalHud;
  paused: boolean;              // game frozen (map / pause screen open)
  setPaused: (p: boolean) => void;
  driving: boolean;             // in a drivable car (Level 1 / Free Play) — switches the touch controls
  free: boolean;                // free play = open city sandbox (cars, weapons, Rugpull camps); mode stays 'survival' for the shared HUD

  // actions
  setPrice: (p: number) => void;
  newCandle: () => void;
  pump: (target: number, durationMs?: number, onDone?: () => void) => void;
  recruit: (id: CrewId, pumpTo: number) => void;
  setObjective: (s: string) => void;
  setPrompt: (s: string | null) => void;
  setQuestStep: (s: QuestStep) => void;
  addOrb: () => void;
  nextQuest: () => void;
  setIntroDone: () => void;
  say: (lines: DialogueLine[], onDone?: () => void) => void;
  endDialogue: () => void;
  playCutscene: (id: string, onDone?: () => void) => void;
  endCutscene: () => void;
  setCaption: (c: string | null) => void;
  setMinigame: (m: Minigame) => void;
  setNoViolence: (b: boolean) => void;
  setStealth: (n: number) => void;
  setLivestream: (b: boolean) => void;
  setQte: (q: QTEState | null) => void;
  setFight: (f: Partial<FightHud>) => void;
  setRace: (r: Partial<RaceHud>) => void;
  setTweet: (b: boolean) => void;
  setPlayerName: (n: string) => void;
  setSurvival: (s: Partial<SurvivalHud>) => void;
  startSurvival: () => void;
  startFreePlay: () => void;
  startArena: (free: boolean) => void;
  setGameOver: (s: string | null) => void;
  addFreed: (n: number) => void;
  resetFreed: () => void;
  showBanner: (t: string | null, ms?: number) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  startGame: (level: LevelId, fresh?: boolean) => void;
  completeLevel: (n: LevelId) => void;
  retry: () => void;
  toMenu: () => void;
  saveProgress: () => void;
  applySave: (s: SaveData) => void;
}

export const useGame = create<GameState>()((set, get) => ({
  screen: 'menu',
  level: 1,
  levelKey: 0,
  levelIntro: 0,
  hasSave: false,
  save: null,

  price: START_PRICE,
  peakPrice: START_PRICE,
  candles: [{ o: START_PRICE, h: START_PRICE, l: START_PRICE, c: START_PRICE }],
  flash: null,
  flashAt: 0,

  crew: emptyCrew(),
  questIndex: 0,
  questStep: 'intro',
  orbsGot: 0,
  introDone: false,
  objective: '',
  prompt: null,

  dialogue: null,
  cutscene: null,
  caption: null,
  minigame: null,
  noViolence: false,
  banner: null,
  toasts: [],
  gameOver: null,
  toBeContinued: false,
  freed: 0,
  stealth: 0,
  qte: null,
  livestream: false,
  fight: NO_FIGHT,
  race: NO_RACE,
  tweet: false,
  playerName: '',
  mode: 'story',
  survival: NO_SURVIVAL,
  free: false,
  driving: false,
  paused: false,
  setPaused: (paused) => set({ paused }),

  setPrice: (p) =>
    set((s) => {
      const candles = s.candles.slice();
      const last = { ...candles[candles.length - 1] };
      last.c = p; last.h = Math.max(last.h, p); last.l = Math.min(last.l, p);
      candles[candles.length - 1] = last;
      const dir = p > s.price ? 'up' : p < s.price ? 'down' : s.flash;
      const flashChanged = dir !== s.flash || Date.now() - s.flashAt > 400;
      return {
        price: p,
        peakPrice: Math.max(s.peakPrice, p),
        candles,
        flash: dir,
        flashAt: flashChanged ? Date.now() : s.flashAt,
      };
    }),
  newCandle: () =>
    set((s) => {
      const c = s.candles.slice(-23);
      c.push({ o: s.price, h: s.price, l: s.price, c: s.price });
      return { candles: c };
    }),
  pump: (target, durationMs = 2500, onDone) => {
    cancelPump?.();
    cancelPump = PricePump(get().price, target, {
      duration: durationMs,
      onTick: (p) => get().setPrice(p),
      onDone: () => { cancelPump = null; onDone?.(); },
    });
  },
  recruit: (id, pumpTo) => {
    set((s) => ({ crew: { ...s.crew, [id]: true } }));
    get().pump(pumpTo, 1800);
    get().saveProgress();
  },

  setObjective: (objective) => set({ objective }),
  setPrompt: (prompt) => set({ prompt }),
  setQuestStep: (questStep) => set({ questStep }),
  addOrb: () => set((s) => ({ orbsGot: s.orbsGot + 1 })),
  nextQuest: () => {
    set((s) => ({
      questIndex: s.questIndex + 1,
      orbsGot: 0,
      questStep: RECRUIT_QUESTS[s.questIndex + 1]?.firstStep ?? 'done',
    }));
    get().saveProgress();
  },
  setIntroDone: () => { set({ introDone: true, questStep: 'orbs' }); get().saveProgress(); },

  say: (lines, onDone) => set({ dialogue: { lines, onDone }, prompt: null }),
  endDialogue: () => {
    const d = get().dialogue;
    set({ dialogue: null });
    d?.onDone?.();
  },
  playCutscene: (id, onDone) => set({ cutscene: { id, onDone }, prompt: null, caption: null }),
  endCutscene: () => {
    const c = get().cutscene;
    set({ cutscene: null, caption: null });
    c?.onDone?.();
  },
  setCaption: (caption) => set({ caption }),
  setMinigame: (minigame) => set({ minigame, prompt: null }),
  setNoViolence: (noViolence) => set({ noViolence }),
  setStealth: (stealth) => set({ stealth }),
  setLivestream: (livestream) => set({ livestream }),
  setQte: (qte) => set({ qte }),
  setTweet: (tweet) => set({ tweet }),
  setPlayerName: (n) => { const name = n.replace(/\s+/g, ' ').trim().slice(0, 14); set({ playerName: name }); lsSet(NAME_KEY, name); },
  setSurvival: (v) => set((s) => ({ survival: { ...s.survival, ...v } })),
  startSurvival: () => get().startArena(false),
  startFreePlay: () => get().startArena(true),
  startArena: (free: boolean) => {
    cancelPump?.();
    const s = get();
    set({
      free, mode: 'survival', screen: 'game', level: 5, levelKey: s.levelKey + 1, levelIntro: Date.now(),
      candles: [{ o: s.price, h: s.price, l: s.price, c: s.price }],
      dialogue: null, cutscene: null, caption: null, minigame: null, noViolence: false, banner: null, gameOver: null,
      toBeContinued: false, prompt: null, toasts: [], freed: 0, stealth: 0, qte: null, livestream: false,
      fight: NO_FIGHT, race: NO_RACE, tweet: false, objective: '', survival: { ...NO_SURVIVAL, best: loadSurvivalBest() },
    });
  },
  setRace: (r) => set((s) => ({ race: { ...s.race, ...r } })),
  setFight: (f) => set((s) => ({ fight: { ...s.fight, ...f } })),
  setGameOver: (gameOver) => set({ gameOver }),
  resetFreed: () => set({ freed: 0 }),
  addFreed: (n) => set((s) => ({ freed: Math.min(200, s.freed + n) })),
  showBanner: (banner, ms = 2400) => {
    set({ banner });
    if (banner && ms > 0) setTimeout(() => { if (get().banner === banner) set({ banner: null }); }, ms);
  },
  toast: (text, tone = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },

  startGame: (level, fresh = false) => {
    cancelPump?.();
    const s = get();
    const base = fresh
      ? { crew: emptyCrew(), questIndex: 0, introDone: false, peakPrice: START_PRICE }
      : {};
    const price = fresh ? START_PRICE : Math.max(LEVEL_START_PRICE[level] ?? START_PRICE, s.peakPrice);
    set({
      ...base,
      screen: 'game',
      mode: 'story', free: false,
      level,
      levelKey: s.levelKey + 1,
      levelIntro: Date.now(),
      price,
      peakPrice: Math.max(price, fresh ? START_PRICE : s.peakPrice),
      candles: [{ o: price, h: price, l: price, c: price }],
      questStep: fresh || !s.introDone ? 'intro' : (RECRUIT_QUESTS[s.questIndex]?.firstStep ?? 'orbs'),
      orbsGot: 0,
      dialogue: null, cutscene: null, caption: null, minigame: null,
      noViolence: false, banner: null, gameOver: null, toBeContinued: false, prompt: null, toasts: [],
      freed: 0, stealth: 0, qte: null, livestream: false, fight: NO_FIGHT, race: NO_RACE, tweet: false,
    });
  },
  completeLevel: (n) => {
    const next = Math.min(5, n + 1) as LevelId;
    set((s) => ({ level: next, save: { ...(s.save as SaveData), level: next } }));
    get().saveProgress();
    if (n >= BUILT_LEVELS) set({ toBeContinued: true });
    else get().startGame(next);
  },
  retry: () => {
    cancelPump?.();
    // restart from the level's starting price (otherwise a liquidation at the price floor instantly re-triggers)
    const s0 = get();
    const reset = s0.mode === 'story' && s0.level >= 2 ? (LEVEL_START_PRICE[s0.level] ?? s0.price) : s0.price;
    set((s) => ({ price: reset, candles: [{ o: reset, h: reset, l: reset, c: reset }], flash: null, levelKey: s.levelKey + 1, gameOver: null, minigame: null, dialogue: null, stealth: 0, qte: null, fight: NO_FIGHT, race: NO_RACE, banner: null, tweet: false, survival: { ...NO_SURVIVAL, best: loadSurvivalBest() } }));
  },
  toMenu: () => { cancelPump?.(); set({ livestream: false, screen: 'menu', cutscene: null, dialogue: null, minigame: null, toBeContinued: false }); },

  saveProgress: () => {
    const s = get();
    const data: SaveData = {
      level: s.level, crew: s.crew, questIndex: s.questIndex, introDone: s.introDone, peak: s.peakPrice,
    };
    set({ save: data, hasSave: true });
    cloudSave(data);
  },
  applySave: (d) =>
    set({
      save: d, hasSave: true, crew: { ...emptyCrew(), ...d.crew },
      questIndex: d.questIndex, introDone: d.introDone, peakPrice: d.peak, price: d.peak, level: d.level,
    }),
}));
