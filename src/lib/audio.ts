/**
 * audio — 100% synthesized WebAudio (no asset files, nothing to download, tiny bundle).
 *  - sfx.*      one-shot effects (punches, pumps, UI, ...)
 *  - music.play per-scene procedural loops (step sequencer: bass + arp + drums)
 *  - engine / rain  continuous beds
 * The AudioContext is created on the first user gesture (browser + Telegram webview autoplay rules).
 * Mute is persisted in localStorage (best effort).
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let unlockedOnce = false;
const lastPlayed = new Map<string, number>();

try { muted = typeof localStorage !== 'undefined' && localStorage.getItem('fta_muted') === '1'; } catch { /* ignore */ }

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function ensure(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    // smooth/soothing master chain: gentle low-pass (rolls off harshness) -> soft compressor -> out
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200; soft.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(soft); soft.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    // warm room reverb (generated impulse) fed from both buses
    try {
      const rl = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, rl, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < rl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2); }
      const cv = ctx.createConvolver(); cv.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.2; cv.connect(wet); wet.connect(master);
      const s1 = ctx.createGain(); s1.gain.value = 0.35; sfxBus.connect(s1); s1.connect(cv);
      const s2 = ctx.createGain(); s2.gain.value = 0.5; musicBus.connect(s2); s2.connect(cv);
    } catch { /* ignore */ }
    const len = ctx.sampleRate * 1.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Call from any user gesture. Safe to call many times. */
export function unlockAudio() {
  const c = ensure(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlockedOnce = true;
}
export function attachAudioUnlock() {
  if (typeof window === 'undefined') return () => {};
  const f = () => unlockAudio();
  const evs = ['pointerdown', 'touchstart', 'keydown', 'click'] as const;
  evs.forEach((e) => window.addEventListener(e, f, { passive: true }));
  const vis = () => { if (document.hidden) ctx?.suspend().catch(() => {}); else if (unlockedOnce) ctx?.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', vis);
  return () => { evs.forEach((e) => window.removeEventListener(e, f)); document.removeEventListener('visibilitychange', vis); };
}

export const isMuted = () => muted;
/** Freeze / unfreeze every sound (pause screen). */
export function setAudioPaused(p: boolean) {
  if (!ctx) return;
  try { if (p) void ctx.suspend(); else void ctx.resume(); } catch { /* ignore */ }
}
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('fta_muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.04);
}

/* ------------------------------------------------------------ primitives */
interface ToneOpts { type?: OscillatorType; vol?: number; slideTo?: number; attack?: number; delay?: number; bus?: GainNode | null; detune?: number }
function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const c = ensure(); if (!c || muted || c.state !== 'running') return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
  if (o.detune) osc.detune.value = o.detune;
  const harsh = osc.type === 'square' || osc.type === 'sawtooth';
  const v = (o.vol ?? 0.2) * (harsh ? 0.75 : 1), a = Math.max(o.attack ?? 0.005, 0.012);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  if (harsh) {   // take the buzz off: gentle low-pass that follows the pitch
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, Math.min(2600, freq * 3)); lp.Q.value = 0.3;
    osc.connect(lp); lp.connect(g);
  } else osc.connect(g);
  g.connect(o.bus ?? sfxBus!);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}
interface NoiseOpts { vol?: number; type?: BiquadFilterType; f0?: number; f1?: number; q?: number; delay?: number; attack?: number; bus?: GainNode | null }
function noise(dur: number, o: NoiseOpts = {}) {
  const c = ensure(); if (!c || muted || c.state !== 'running' || !noiseBuf) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.f0 ?? 1200, t0);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + dur);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain(); const v = o.vol ?? 0.25;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + Math.max(o.attack ?? 0.004, 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(o.bus ?? sfxBus!);
  src.start(t0, Math.random()); src.stop(t0 + dur + 0.03);
}
/** rate limit so per-frame callers can't spam */
function gate(key: string, ms: number) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -1e9) < ms) return false;
  lastPlayed.set(key, now); return true;
}

/* ------------------------------------------------------------------ SFX */
export const sfx = {
  /** Synthesised war cry: a crowd of detuned voices with vowel formants, rising shout then falling roar. */
  /** Cinematic impact: sub drop + low thud + noise burst. */
  boom() {
    tone(90, 1.1, { type: 'sine', vol: 0.7, slideTo: 28 });
    tone(55, 0.8, { type: 'triangle', vol: 0.35, slideTo: 30 });
    noise(0.9, { type: 'lowpass', f0: 2200, f1: 80, vol: 0.45, attack: 0.005 });
  },
  /** Rising tension swell (use before a reveal). */
  riser(dur = 2.6) {
    tone(110, dur, { type: 'sawtooth', vol: 0.09, slideTo: 440, attack: dur * 0.8 });
    tone(220, dur, { type: 'triangle', vol: 0.07, slideTo: 880, attack: dur * 0.8 });
    noise(dur, { type: 'bandpass', f0: 300, f1: 5000, q: 0.9, vol: 0.14, attack: dur * 0.9 });
  },
  /** Dramatic orchestral-style hit: a dark minor chord with a brass-ish edge. */
  drama() {
    [110, 131, 165, 220].forEach((f, i) => tone(f, 1.8, { type: 'sawtooth', vol: 0.09, slideTo: f * 0.97, attack: 0.04, delay: i * 0.012 }));
    tone(55, 1.6, { type: 'sine', vol: 0.5, slideTo: 40 });
    noise(0.5, { type: 'lowpass', f0: 1800, f1: 200, vol: 0.3 });
  },
  /** Low ominous bed for a scene (slow wobbling drone). */
  drone(dur = 5) {
    tone(55, dur, { type: 'sawtooth', vol: 0.08, slideTo: 52, attack: 1.2 });
    tone(82.5, dur, { type: 'triangle', vol: 0.08, slideTo: 78, attack: 1.6 });
    noise(dur, { type: 'lowpass', f0: 350, f1: 220, q: 0.5, vol: 0.1, attack: 1.4 });
  },
  /** Distant crowd / room murmur. */
  murmur(dur = 4) {
    for (let i = 0; i < 4; i++) noise(dur, { type: 'bandpass', f0: 380 + i * 170, f1: 520 + i * 120, q: 2.2, vol: 0.05, attack: 0.9, delay: i * 0.15 });
  },
  /** Cash register / money counter. */
  cash() {
    [0, 0.07, 0.14, 0.21].forEach((d, i) => noise(0.04, { type: 'highpass', f0: 4000, vol: 0.1, delay: d + i * 0.01 }));
    tone(2093, 0.5, { type: 'triangle', vol: 0.14, delay: 0.3 }); tone(3136, 0.6, { type: 'sine', vol: 0.1, delay: 0.32 });
  },
  /** Screen glitch / tech blip. */
  zap() {
    tone(1400, 0.18, { type: 'square', vol: 0.08, slideTo: 200 });
    tone(220, 0.25, { type: 'sawtooth', vol: 0.08, slideTo: 1600, delay: 0.1 });
    noise(0.3, { type: 'highpass', f0: 2500, vol: 0.12 });
  },
  /** Keyboard typing burst. */
  keys() { for (let i = 0; i < 9; i++) tone(1700 + Math.random() * 900, 0.02, { type: 'square', vol: 0.05, delay: i * 0.07 + Math.random() * 0.03 }); },
  /** Combo hit: pitch climbs with the chain length. */
  comboHit(n = 2) {
    const base = 392 * Math.pow(1.06, Math.min(n, 12));
    tone(base, 0.12, { type: 'square', vol: 0.15 }); tone(base * 1.5, 0.2, { type: 'square', vol: 0.14, delay: 0.08 });
    noise(0.12, { type: 'highpass', f0: 3500, vol: 0.12, delay: 0.05 });
    if (n >= 5) sfx.boom();
  },
  battleCry() {
    const c = ensure(); if (!c || muted || c.state !== 'running' || !sfxBus) return;
    const t0 = c.currentTime, dur = 1.25;
    [[150, 0], [188, 7], [118, -9], [226, 12]].forEach(([f, det], i) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.8, t0); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.28); o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + dur);
      o.detune.value = det * 6;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6 + i; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.detune);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.setValueAtTime(500, t0); f1.frequency.linearRampToValueAtTime(820, t0 + 0.3); f1.frequency.linearRampToValueAtTime(620, t0 + dur);
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.setValueAtTime(1100, t0); f2.frequency.linearRampToValueAtTime(1250, t0 + 0.3); f2.frequency.linearRampToValueAtTime(950, t0 + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12); g.gain.setValueAtTime(0.16, t0 + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(sfxBus!);
      o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
    });
    noise(dur * 0.8, { type: 'bandpass', f0: 1800, f1: 900, q: 0.7, vol: 0.12, attack: 0.1 });
    tone(70, 0.5, { type: 'sine', vol: 0.5, slideTo: 38 });                       // chest thump
  },
  /** Rugpull's death in slow motion: deep falling groan, reversed-style noise swell, heartbeat. */
  slowDeath() {
    tone(180, 3.2, { type: 'sawtooth', vol: 0.22, slideTo: 36, attack: 0.05 });
    tone(90, 3.4, { type: 'sine', vol: 0.4, slideTo: 28, attack: 0.1 });
    noise(2.6, { type: 'lowpass', f0: 200, f1: 3500, q: 1.2, vol: 0.18, attack: 1.6 });
    [0, 0.7, 1.4, 2.1].forEach((d, i) => tone(55 - i * 4, 0.28, { type: 'sine', vol: 0.55 - i * 0.08, slideTo: 30, delay: d }));
  },
  click() { if (!gate('click', 40)) return; tone(760, 0.07, { type: 'sine', vol: 0.1 }); },
  select() { sfx.rhodes(523, 0.35, 0.1); sfx.rhodes(784, 0.5, 0.09, 0.05); },
  blip(pitch = 1) { if (!gate('blip', 45)) return; tone(300 * pitch + Math.random() * 40, 0.04, { type: 'square', vol: 0.06 }); },
  popup() { tone(420, 0.08, { type: 'sine', vol: 0.18, slideTo: 760 }); },
  whoosh() { if (!gate('whoosh', 80)) return; noise(0.16, { type: 'bandpass', f0: 500, f1: 2200, q: 0.9, vol: 0.18, attack: 0.03 }); },
  punch() { if (!gate('punch', 60)) return; sfx.whoosh(); },
  hit(heavy = false) {
    if (!gate(heavy ? 'hitH' : 'hit', 50)) return;
    noise(heavy ? 0.22 : 0.12, { type: 'lowpass', f0: heavy ? 1400 : 2400, f1: 120, vol: heavy ? 0.5 : 0.36 });
    tone(heavy ? 90 : 140, heavy ? 0.2 : 0.11, { type: 'sine', vol: heavy ? 0.55 : 0.4, slideTo: 40 });
  },
  hurt() { if (!gate('hurt', 120)) return; tone(220, 0.18, { type: 'sawtooth', vol: 0.18, slideTo: 90 }); noise(0.1, { type: 'lowpass', f0: 1800, f1: 200, vol: 0.2 }); },
  slam() {
    if (!gate('slam', 120)) return;
    tone(120, 0.55, { type: 'sine', vol: 0.7, slideTo: 28 });
    noise(0.5, { type: 'lowpass', f0: 2600, f1: 80, vol: 0.55 });
    tone(60, 0.7, { type: 'triangle', vol: 0.4, slideTo: 30, delay: 0.04 });
  },
  jump() { if (!gate('jump', 120)) return; tone(260, 0.14, { type: 'square', vol: 0.09, slideTo: 520 }); },
  dodge() { if (!gate('dodge', 100)) return; noise(0.22, { type: 'highpass', f0: 800, f1: 3500, vol: 0.2, attack: 0.04 }); },
  step() { if (!gate('step', 90)) return; noise(0.05, { type: 'lowpass', f0: 600 + Math.random() * 300, f1: 160, vol: 0.09 }); },
  coin() { sfx.rhodes(988, 0.5, 0.11); sfx.rhodes(1319, 0.7, 0.1, 0.08); },
  /** price tick: pitch rises with `k` (0..1 progress up the price ladder) */
  pumpTick(k = 0) { if (!gate('pump', 85)) return; tone(440 * Math.pow(2, k * 2) , 0.06, { type: 'square', vol: 0.07 }); },
  dumpTick() { if (!gate('dump', 160)) return; tone(220, 0.09, { type: 'sawtooth', vol: 0.07, slideTo: 140 }); },
  toast(tone_: 'good' | 'bad' | 'info') {
    if (tone_ === 'good') { tone(660, 0.08, { type: 'triangle', vol: 0.18 }); tone(990, 0.14, { type: 'triangle', vol: 0.18, delay: 0.07 }); }
    else if (tone_ === 'bad') { tone(240, 0.16, { type: 'sawtooth', vol: 0.14, slideTo: 150 }); }
    else tone(600, 0.08, { type: 'sine', vol: 0.14 });
  },
  banner() { sfx.rhodes(392, 0.7, 0.12); sfx.rhodes(494, 0.7, 0.11, 0.1); sfx.rhodes(659, 1.2, 0.12, 0.2); },
  fanfare() { sfx.soulChord(261.63, 0.11, 1.8); sfx.rhodes(1046, 1.4, 0.09, 0.4); },
  stinger() { tone(110, 0.9, { type: 'sawtooth', vol: 0.16, slideTo: 55 }); noise(0.9, { type: 'bandpass', f0: 300, f1: 1800, q: 1.4, vol: 0.12, attack: 0.5 }); },
  countdown(final = false) { tone(final ? 1046 : 523, final ? 0.5 : 0.18, { type: 'square', vol: 0.2 }); },
  caution() { if (!gate('caution', 800)) return; tone(520, 0.12, { type: 'square', vol: 0.12 }); tone(520, 0.12, { type: 'square', vol: 0.12, delay: 0.18 }); },
  alarm() { if (!gate('alarm', 1200)) return; for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 880, 0.14, { type: 'sawtooth', vol: 0.16, delay: i * 0.16 }); },
  warn() { if (!gate('warn', 300)) return; tone(300, 0.2, { type: 'sawtooth', vol: 0.18, slideTo: 600 }); tone(300, 0.2, { type: 'sawtooth', vol: 0.18, slideTo: 600, delay: 0.22 }); },
  qteTick() { if (!gate('qte', 50)) return; tone(700 + Math.random() * 200, 0.04, { type: 'square', vol: 0.1 }); },
  qteDone() { sfx.rhodes(784, 0.5, 0.12); sfx.rhodes(1175, 0.9, 0.1, 0.09); },
  key() { if (!gate('key', 35)) return; tone(1800 + Math.random() * 600, 0.025, { type: 'square', vol: 0.05 }); },
  cage() { if (!gate('cage', 90)) return; noise(0.3, { type: 'bandpass', f0: 1800, f1: 300, q: 2, vol: 0.4 }); tone(180, 0.25, { type: 'square', vol: 0.2, slideTo: 60 }); tone(1500, 0.12, { type: 'triangle', vol: 0.12, delay: 0.03 }); },
  freed() { if (!gate('freed', 110)) return; tone(880 + Math.random() * 300, 0.05, { type: 'triangle', vol: 0.06 }); },
  gameOver() { [392, 330, 262, 196].forEach((f, i) => sfx.rhodes(f, 1.4, 0.12, i * 0.28)); },
  win() { sfx.soulChord(293.66, 0.12, 2.4); sfx.rhodes(1175, 1.8, 0.09, 0.5); },
  barrel() { if (!gate('barrel', 120)) return; noise(0.18, { type: 'bandpass', f0: 400, f1: 1600, q: 1, vol: 0.2 }); tone(160, 0.3, { type: 'triangle', vol: 0.25, slideTo: 90, delay: 0.25 }); },
  crash() { if (!gate('crash', 200)) return; noise(0.35, { type: 'lowpass', f0: 3000, f1: 150, vol: 0.5 }); tone(100, 0.3, { type: 'square', vol: 0.3, slideTo: 40 }); },
  bump() { if (!gate('bump', 250)) return; noise(0.15, { type: 'lowpass', f0: 1200, f1: 100, vol: 0.4 }); tone(80, 0.15, { type: 'sine', vol: 0.5, slideTo: 40 }); },
  boost() { if (!gate('boost', 400)) return; noise(0.5, { type: 'bandpass', f0: 300, f1: 3000, q: 0.8, vol: 0.2, attack: 0.12 }); tone(180, 0.5, { type: 'sawtooth', vol: 0.12, slideTo: 540 }); },
  lane() { if (!gate('lane', 90)) return; noise(0.22, { type: 'bandpass', f0: 2200, f1: 800, q: 3, vol: 0.14, attack: 0.02 }); tone(1500, 0.18, { type: 'sine', vol: 0.03, slideTo: 900 }); },
  meastMode() {
    tone(70, 1.0, { type: 'sawtooth', vol: 0.35, slideTo: 280, attack: 0.05 });
    noise(1.0, { type: 'bandpass', f0: 200, f1: 3000, q: 1.2, vol: 0.3, attack: 0.3 });
    [262, 330, 392, 523].forEach((f, i) => tone(f, 0.5, { type: 'square', vol: 0.13, delay: 0.45 + i * 0.07 }));
  },
  chain() { if (!gate('chain', 100)) return; for (let i = 0; i < 5; i++) tone(2400 + Math.random() * 1500, 0.04, { type: 'square', vol: 0.07, delay: i * 0.035 }); noise(0.2, { type: 'highpass', f0: 3000, vol: 0.1 }); },
  grab() { tone(150, 0.25, { type: 'sawtooth', vol: 0.3, slideTo: 60 }); noise(0.25, { type: 'lowpass', f0: 1800, f1: 200, vol: 0.35 }); this.chain(); },
  thunder() {
    noise(2.4, { type: 'lowpass', f0: 900, f1: 60, vol: 0.6, attack: 0.15 });
    tone(55, 1.8, { type: 'sine', vol: 0.4, slideTo: 32, delay: 0.1 });
  },
  firework() { if (!gate('fw', 70)) return; tone(900 + Math.random() * 600, 0.4, { type: 'sine', vol: 0.07, slideTo: 2200 }); noise(0.35, { type: 'bandpass', f0: 3200, f1: 900, q: 1, vol: 0.2, delay: 0.38 }); },
  notify() { sfx.rhodes(880, 0.6, 0.12); sfx.rhodes(1318, 0.9, 0.1, 0.12); },
  recruit() { sfx.fanfare(); },
  squeak() { if (!gate('squeak', 1500)) return; tone(500, 0.09, { type: 'sine', vol: 0.2, slideTo: 1300 }); tone(1300, 0.09, { type: 'sine', vol: 0.2, slideTo: 700, delay: 0.1 }); },
  shot(enemy = false) {
    if (!gate(enemy ? 'shotE' : 'shot', 60)) return;
    const k = enemy ? 0.6 : 1;
    tone(115, 0.26, { type: 'sine', vol: 0.75 * k, slideTo: 38 });
    noise(0.18, { type: 'lowpass', f0: 2200, f1: 140, vol: 0.5 * k });
    noise(0.03, { type: 'bandpass', f0: 2400, f1: 900, q: 0.8, vol: 0.14 * k });
    noise(0.5, { type: 'lowpass', f0: 700, f1: 70, vol: 0.14 * k, delay: 0.03, attack: 0.03 });
  },
  reload() { tone(700, 0.04, { type: 'square', vol: 0.1 }); tone(500, 0.05, { type: 'square', vol: 0.1, delay: 0.5 }); tone(900, 0.06, { type: 'square', vol: 0.12, delay: 1.1 }); },
  pickup() { sfx.rhodes(523, 0.6, 0.12); sfx.rhodes(659, 0.6, 0.11, 0.09); sfx.rhodes(784, 1.0, 0.11, 0.18); },
  airdrop() { tone(900, 0.8, { type: 'sine', vol: 0.1, slideTo: 300 }); },
  burn() { noise(1.2, { type: 'bandpass', f0: 800, f1: 400, q: 0.6, vol: 0.28, attack: 0.3 }); },
  /* ---- driving */
  carCrash() {
    if (!gate('carCrash', 300)) return;
    noise(0.7, { type: 'lowpass', f0: 4200, f1: 90, vol: 0.7 });
    tone(70, 0.6, { type: 'sawtooth', vol: 0.5, slideTo: 28 });
    for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 2600, 0.05, { type: 'square', vol: 0.09, delay: 0.04 + i * 0.045 }); // glass
    noise(0.6, { type: 'bandpass', f0: 2600, f1: 700, q: 2.5, vol: 0.3, delay: 0.05 });                                       // tyre screech
  },
  /** oncoming car whooshes past: Doppler drop */
  passBy() {
    if (!gate('passBy', 120)) return;
    noise(0.55, { type: 'bandpass', f0: 2400, f1: 260, q: 1.1, vol: 0.38, attack: 0.08 });
    tone(520, 0.5, { type: 'sawtooth', vol: 0.12, slideTo: 150, attack: 0.05 });
  },
  /** "car ahead!" two-tone warning */
  oncoming() { if (!gate('oncoming', 700)) return; tone(420, 0.13, { type: 'square', vol: 0.16 }); tone(560, 0.16, { type: 'square', vol: 0.16, delay: 0.15 }); },
  honk() { if (!gate('honk', 500)) return; tone(392, 0.32, { type: 'sawtooth', vol: 0.13 }); tone(494, 0.32, { type: 'sawtooth', vol: 0.11 }); },
  overtake() { sfx.rhodes(523, 0.4, 0.1); sfx.rhodes(784, 0.6, 0.1, 0.07); },
  overtaken() { tone(500, 0.1, { type: 'sawtooth', vol: 0.12, slideTo: 300 }); },
  finishLine() { sfx.fanfare(); noise(1.4, { type: 'bandpass', f0: 1500, f1: 3000, q: 0.5, vol: 0.12, attack: 0.3 }); },
  /* ---- UI / flow */
  levelStart() { sfx.soulChord(196, 0.1, 2.0); },
  prompt() { if (!gate('prompt', 250)) return; tone(1100, 0.04, { type: 'sine', vol: 0.1 }); tone(1500, 0.05, { type: 'sine', vol: 0.08, delay: 0.04 }); },
  objective() { if (!gate('objective', 600)) return; sfx.rhodes(440, 0.6, 0.1); sfx.rhodes(554, 0.7, 0.09, 0.1); },
  heartbeat() { if (!gate('heart', 850)) return; tone(60, 0.12, { type: 'sine', vol: 0.5, slideTo: 40 }); tone(55, 0.14, { type: 'sine', vol: 0.4, slideTo: 38, delay: 0.17 }); },
  kill() { if (!gate('kill', 60)) return; sfx.rhodes(330, 0.35, 0.07); },
  waveStart() { tone(150, 0.5, { type: 'sawtooth', vol: 0.22, slideTo: 90 }); tone(150, 0.5, { type: 'sawtooth', vol: 0.22, slideTo: 90, delay: 0.3 }); noise(0.8, { type: 'lowpass', f0: 800, f1: 150, vol: 0.2, attack: 0.2 }); },
  waveClear() { sfx.soulChord(220, 0.11, 1.8); },
  /** per-weapon gunshot */
  gun(id: string) {
    const g = id === 'smg' ? 'gunS' : 'gun' + id;
    if (!gate(g, id === 'smg' ? 45 : id === 'rifle' ? 70 : 90)) return;
    const boomy = (sub: number, len: number, vol: number, body: number) => {
      tone(sub, len, { type: 'sine', vol, slideTo: 34 });
      noise(len * 0.7, { type: 'lowpass', f0: 2400, f1: 120, vol: body });
      noise(0.03, { type: 'bandpass', f0: 2200, f1: 800, q: 0.8, vol: 0.12 });
      noise(len * 1.8, { type: 'lowpass', f0: 600, f1: 60, vol: body * 0.28, delay: 0.03, attack: 0.03 });
    };
    if (id === 'smg') boomy(150, 0.14, 0.55, 0.32);
    else if (id === 'shotgun') { boomy(95, 0.42, 0.95, 0.7); tone(60, 0.5, { type: 'sine', vol: 0.5, slideTo: 28, delay: 0.02 }); }
    else if (id === 'rifle') boomy(125, 0.22, 0.75, 0.46);
    else if (id === 'sniper') { boomy(78, 0.6, 1.0, 0.6); noise(0.9, { type: 'lowpass', f0: 900, f1: 60, vol: 0.2, delay: 0.1, attack: 0.1 }); }
    else sfx.shot(false);
  },
  swap() { if (!gate('swap', 120)) return; noise(0.05, { type: 'highpass', f0: 2500, vol: 0.14 }); tone(420, 0.05, { type: 'square', vol: 0.1 }); tone(640, 0.06, { type: 'square', vol: 0.1, delay: 0.07 }); },
  empty() { if (!gate('empty', 200)) return; tone(260, 0.04, { type: 'square', vol: 0.12 }); },
  weaponGet() { sfx.rhodes(392, 0.6, 0.12); sfx.rhodes(523, 0.6, 0.11, 0.08); sfx.rhodes(659, 0.9, 0.11, 0.16); },
  land() { if (!gate('land', 150)) return; noise(0.07, { type: 'lowpass', f0: 500, f1: 120, vol: 0.18 }); },
  /** Warm electric-piano note (sine body + soft octave + tiny bell) */
  rhodes(f: number, dur = 0.9, vol = 0.14, delay = 0) {
    tone(f, dur, { type: 'sine', vol, attack: 0.012, delay });
    tone(f * 2, dur * 0.45, { type: 'sine', vol: vol * 0.3, delay });
    tone(f * 4.01, 0.12, { type: 'sine', vol: vol * 0.1, delay });
  },
  /** Soulful maj7/9 chord roll */
  soulChord(root = 261.63, vol = 0.1, dur = 1.4) { [1, 1.25, 1.5, 1.875, 2.25].forEach((r, i) => sfx.rhodes(root * r, dur, vol - i * 0.01, i * 0.07)); },
  /** Low groan before a character falls (zombie) */
  zombie() {
    if (!gate('zombie', 140)) return;
    const c = ensure(); if (!c || muted || c.state !== 'running' || !sfxBus) return;
    const t0 = c.currentTime, dur = 0.95 + Math.random() * 0.3, f0 = 85 + Math.random() * 45;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.25, t0); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t0 + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 7; lfo.connect(lg); lg.connect(o.detune);
    const fa = c.createBiquadFilter(); fa.type = 'bandpass'; fa.Q.value = 4; fa.frequency.setValueAtTime(520, t0); fa.frequency.linearRampToValueAtTime(300, t0 + dur);
    const fb = c.createBiquadFilter(); fb.type = 'bandpass'; fb.Q.value = 5; fb.frequency.setValueAtTime(980, t0); fb.frequency.linearRampToValueAtTime(620, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.14); g.gain.setValueAtTime(0.2, t0 + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(fa); o.connect(fb); fa.connect(g); fb.connect(g); g.connect(sfxBus);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
    noise(dur * 0.8, { type: 'bandpass', f0: 700, f1: 350, q: 0.9, vol: 0.05, attack: 0.15 });
  },
  /** Jack's slow-motion "daaamnn!" (formant voice stretched over ~2.7s, plus a speech-synth layer where the browser has one) */
  jackScream() {
    if (!gate('jackScream', 4000)) return;
    const c = ensure(); if (!c || muted || c.state !== 'running' || !sfxBus) return;
    const bus = sfxBus, t0 = c.currentTime + 0.02, dur = 2.7;
    noise(0.05, { type: 'bandpass', f0: 1800, f1: 600, q: 1.2, vol: 0.16 });
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(235, t0 + 0.4);
    o.frequency.exponentialRampToValueAtTime(190, t0 + 1.2); o.frequency.exponentialRampToValueAtTime(88, t0 + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(2, t0); lg.gain.linearRampToValueAtTime(26, t0 + dur); lfo.connect(lg); lg.connect(o.detune);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.1); out.gain.setValueAtTime(0.5, t0 + 1.2);
    out.gain.exponentialRampToValueAtTime(0.14, t0 + 1.8); out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const mk = (f: number[], q: number, vol: number) => {
      const b = c.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = q;
      b.frequency.setValueAtTime(f[0], t0); b.frequency.linearRampToValueAtTime(f[1], t0 + 0.3);
      b.frequency.setValueAtTime(f[1], t0 + 1.0); b.frequency.linearRampToValueAtTime(f[2], t0 + 1.7);
      b.frequency.linearRampToValueAtTime(f[3], t0 + dur);
      const g = c.createGain(); g.gain.value = vol; o.connect(b); b.connect(g); g.connect(out);
    };
    mk([320, 760, 280, 260], 6, 1); mk([1100, 1700, 1000, 900], 7, 0.7); mk([2500, 2500, 2300, 2300], 8, 0.25);
    out.connect(bus); o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
    tone(70, 1.0, { type: 'sine', vol: 0.4, slideTo: 30, delay: 0.1 });
    try {
      const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
      if (ss) { const u = new SpeechSynthesisUtterance('daaamnn!'); u.pitch = 0.45; u.rate = 0.35; u.volume = 0.9; ss.cancel(); ss.speak(u); }
    } catch { /* ignore */ }
  },
};

/* -------------------------------------------------------------- beds */
let engineNodes: { o1: OscillatorNode; o2: OscillatorNode; o3: OscillatorNode; g: GainNode; f: BiquadFilterNode; wind: AudioBufferSourceNode; wg: GainNode; gear: number } | null = null;
const GEARS = [0, 9, 18, 27, 36, 48];
/** Sports-car engine: three detuned oscillators whose pitch sweeps through 5 gears, plus a wind bed. */
export const engine = {
  start() {
    const c = ensure(); if (!c || engineNodes || !noiseBuf) return;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o1.type = 'triangle'; o2.type = 'sine'; o3.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.5; g.gain.value = 0.0001;
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(sfxBus!);
    const wind = c.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.4;
    const wg = c.createGain(); wg.gain.value = 0.0001; wind.connect(wf); wf.connect(wg); wg.connect(sfxBus!);
    o1.start(); o2.start(); o3.start(); wind.start();
    engineNodes = { o1, o2, o3, g, f, wind, wg, gear: 0 };
  },
  /** speed in m/s */
  set(speed: number, boosting = false) {
    if (!engineNodes || !ctx) return;
    const t = ctx.currentTime;
    let gi = 0; while (gi < GEARS.length - 2 && speed >= GEARS[gi + 1]) gi++;
    const frac = Math.max(0, Math.min(1, (speed - GEARS[gi]) / (GEARS[gi + 1] - GEARS[gi])));
    const hz = 52 + frac * 78 + gi * 5 + (boosting ? 14 : 0);
    if (gi !== engineNodes.gear) { // gear change: brief rev dip + pop
      if (gi > engineNodes.gear) noise(0.08, { type: 'lowpass', f0: 500, f1: 200, q: 0.5, vol: 0.04 });
      engineNodes.gear = gi;
    }
    engineNodes.o1.frequency.setTargetAtTime(hz, t, 0.1);
    engineNodes.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.1);
    engineNodes.o3.frequency.setTargetAtTime(hz * 1.007, t, 0.1);
    engineNodes.f.frequency.setTargetAtTime(260 + frac * 420 + (boosting ? 200 : 0), t, 0.12);
    engineNodes.g.gain.setTargetAtTime(muted || speed <= 0.3 ? 0.008 : 0.028 + Math.min(0.02, speed * 0.0007) + (boosting ? 0.01 : 0), t, 0.15);
    engineNodes.wg.gain.setTargetAtTime(muted ? 0 : Math.min(0.045, speed * 0.0012), t, 0.3);
  },
  stop() {
    if (!engineNodes || !ctx) return;
    const n = engineNodes; engineNodes = null;
    n.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    n.wg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    setTimeout(() => { try { n.o1.stop(); n.o2.stop(); n.o3.stop(); n.wind.stop(); } catch { /* ignore */ } }, 400);
  },
};

let rainNodes: { src: AudioBufferSourceNode; g: GainNode } | null = null;
const RAIN_SOUND = false;
export const rain = {
  start(vol = 0.045) {
    if (!RAIN_SOUND) return;   // rain ambience removed (the visual rain stays)
    const c = ensure(); if (!c || rainNodes || !noiseBuf) return;
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = muted ? 0 : vol;
    src.connect(f); f.connect(g); g.connect(sfxBus!); src.start();
    rainNodes = { src, g };
  },
  /** fade the rain bed to a new level (e.g. quieter during the ending) */
  setVol(v: number) {
    if (!rainNodes || !ctx) return;
    rainNodes.g.gain.setTargetAtTime(muted ? 0 : Math.max(0.0001, v), ctx.currentTime, 0.6);
  },
  stop() {
    if (!rainNodes || !ctx) return;
    const n = rainNodes; rainNodes = null;
    n.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    setTimeout(() => { try { n.src.stop(); } catch { /* ignore */ } }, 800);
  },
};

/* ------------------------------------------------------------------ music */
export type ThemeId = 'menu' | 'city' | 'stealth' | 'brawl' | 'race' | 'duel' | 'battle' | 'victory' | 'grave' | 'survival' | 'none';
interface Theme {
  bpm: number; root: number; scale: number[]; chords: number[];
  bass: (number | null)[]; arp: (number | null)[];
  kick: number[]; snare: number[]; hat: number[];
  bassWave: OscillatorType; arpWave: OscillatorType; bassVol: number; arpVol: number; drumVol: number; arpOct: number;
}
const MIN = [0, 2, 3, 5, 7, 8, 10], PHR = [0, 1, 3, 5, 7, 8, 10], MAJ = [0, 2, 4, 5, 7, 9, 11];
const N = null;
const THEMES: Record<Exclude<ThemeId, 'none'>, Theme> = {
  menu: { bpm: 100, root: 45, scale: MIN, chords: [0, 5, 3, 4], bass: [0, N, N, 0, N, N, 0, N, 0, N, N, 0, N, 2, N, N], arp: [0, 2, 4, 2, 0, 2, 4, 7, 0, 2, 4, 2, 7, 4, 2, 4],
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], bassWave: 'sawtooth', arpWave: 'square', bassVol: 0.5, arpVol: 0.2, drumVol: 0.7, arpOct: 1 },
  city: { bpm: 92, root: 43, scale: MIN, chords: [0, 3, 5, 4], bass: [0, N, N, N, 0, N, N, 2, N, N, 0, N, N, N, 3, N], arp: [N, 4, N, 2, N, 4, N, 7, N, 4, N, 2, N, 0, N, 2],
    kick: [0, 10], snare: [8], hat: [4, 12], bassWave: 'triangle', arpWave: 'triangle', bassVol: 0.55, arpVol: 0.22, drumVol: 0.5, arpOct: 1 },
  stealth: { bpm: 68, root: 38, scale: PHR, chords: [0, 0, 1, 0], bass: [0, N, N, N, N, N, N, N, 0, N, N, N, N, N, 1, N], arp: [N, N, N, N, 7, N, N, N, N, N, 4, N, N, N, N, N],
    kick: [0, 6], snare: [], hat: [], bassWave: 'sine', arpWave: 'sine', bassVol: 0.7, arpVol: 0.22, drumVol: 0.45, arpOct: 2 },
  brawl: { bpm: 142, root: 40, scale: PHR, chords: [0, 0, 5, 1], bass: [0, N, 0, N, 0, N, 0, N, 0, N, 0, N, 1, N, 1, N], arp: [0, N, 3, N, 0, N, 4, N, 0, N, 3, N, 5, N, 4, N],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'sawtooth', arpWave: 'square', bassVol: 0.55, arpVol: 0.16, drumVol: 1, arpOct: 1 },
  race: { bpm: 146, root: 40, scale: MIN, chords: [0, 5, 3, 4], bass: [0, N, 0, 0, N, 0, 0, N, 0, N, 0, 0, N, 0, 2, N], arp: [0, 4, 7, 9, 7, 4, 0, 4, 2, 5, 9, 12, 9, 5, 2, 5],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14, 15], bassWave: 'sawtooth', arpWave: 'square', bassVol: 0.55, arpVol: 0.2, drumVol: 0.95, arpOct: 1 },
  survival: { bpm: 156, root: 38, scale: PHR, chords: [0, 1, 0, 5], bass: [0, 0, N, 0, 0, N, 0, 1, 0, 0, N, 0, 1, N, 0, N], arp: [7, N, 4, N, 7, N, 3, N, 9, N, 7, N, 4, N, 3, 1],
    kick: [0, 3, 4, 8, 11, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassWave: 'sawtooth', arpWave: 'square', bassVol: 0.6, arpVol: 0.17, drumVol: 1, arpOct: 1 },
  duel: { bpm: 118, root: 36, scale: PHR, chords: [0, 0, 1, 5], bass: [0, N, N, 0, N, N, 0, N, 1, N, N, 1, N, N, 0, N], arp: [N, N, 4, N, N, N, 7, N, N, N, 3, N, N, N, 1, N],
    kick: [0, 3, 8, 11], snare: [12], hat: [6, 14], bassWave: 'sawtooth', arpWave: 'triangle', bassVol: 0.65, arpVol: 0.2, drumVol: 0.95, arpOct: 1 },
  battle: { bpm: 164, root: 33, scale: PHR, chords: [0, 0, 1, 0, 5, 5, 1, 0], bass: [0, 0, N, 0, 0, N, 0, 0, 1, 1, N, 1, 0, N, 0, 1], arp: [7, N, 7, 4, N, 7, 9, N, 7, N, 4, 3, N, 4, 3, 1],
    kick: [0, 2, 4, 6, 8, 10, 11, 12, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14, 15], bassWave: 'sawtooth', arpWave: 'sawtooth', bassVol: 0.7, arpVol: 0.2, drumVol: 1.1, arpOct: 1 },
  victory: { bpm: 128, root: 48, scale: MAJ, chords: [0, 3, 4, 0], bass: [0, N, 0, N, 0, N, 0, N, 0, N, 0, N, 0, N, 4, N], arp: [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bassWave: 'triangle', arpWave: 'square', bassVol: 0.6, arpVol: 0.18, drumVol: 0.8, arpOct: 1 },
  grave: { bpm: 56, root: 41, scale: MIN, chords: [0, 5, 3, 4], bass: [0, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N], arp: [N, N, N, N, 4, N, N, N, N, N, N, N, 2, N, N, N],
    kick: [], snare: [], hat: [], bassWave: 'sine', arpWave: 'sine', bassVol: 0.6, arpVol: 0.25, drumVol: 0, arpOct: 1 },
};

let theme: ThemeId = 'none';
let tempoMul = 1;
let wanted: ThemeId = 'none';   // theme requested (may still be fading in)
let fadeSeq = 0;
let step = 0, nextT = 0, timer: ReturnType<typeof setInterval> | null = null;

function drums(t: Theme, s: number, when: number) {
  const c = ctx!; const m = musicBus!;
  if (t.kick.includes(s)) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, when); o.frequency.exponentialRampToValueAtTime(40, when + 0.14);
    g.gain.setValueAtTime(0.6 * t.drumVol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    o.connect(g); g.connect(m); o.start(when); o.stop(when + 0.22);
  }
  if (t.snare.includes(s) && noiseBuf) {
    const src = c.createBufferSource(); src.buffer = noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300;
    const g = c.createGain(); g.gain.setValueAtTime(0.22 * t.drumVol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    src.connect(f); f.connect(g); g.connect(m); src.start(when, Math.random()); src.stop(when + 0.16);
  }
  if (t.hat.includes(s) && noiseBuf) {
    const src = c.createBufferSource(); src.buffer = noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6000; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.setValueAtTime(0.07 * t.drumVol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(f); f.connect(g); g.connect(m); src.start(when, Math.random()); src.stop(when + 0.06);
  }
}
function note(wave: OscillatorType, midi: number, when: number, dur: number, vol: number) {
  const c = ctx!; const o = c.createOscillator(), g = c.createGain();
  o.type = wave === 'square' || wave === 'sawtooth' ? 'triangle' : wave; o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(musicBus!); o.start(when); o.stop(when + dur + 0.02);
}
function schedule() {
  if (!ctx || theme === 'none') return;
  const T = THEMES[theme];
  const stepDur = 60 / T.bpm / 4 / tempoMul;
  while (nextT < ctx.currentTime + 0.18) {
    const s = step % 16, bar = Math.floor(step / 16) % T.chords.length, deg = T.chords[bar];
    const at = (d: number) => {
      const len = T.scale.length, idx = deg + d, oct = Math.floor(idx / len);
      return T.root + T.scale[((idx % len) + len) % len] + 12 * oct;
    };
    if (!muted) {
      drums(T, s, nextT);
      const b = T.bass[s]; if (b !== null && b !== undefined) note(T.bassWave, at(b), nextT, stepDur * 1.7, 0.2 * T.bassVol);
      const a = T.arp[s]; if (a !== null && a !== undefined) note(T.arpWave, at(a) + 12 * T.arpOct, nextT, stepDur * 1.2, 0.12 * T.arpVol * 4);
    }
    nextT += stepDur; step++;
  }
}
export const music = {
  play(id: ThemeId) {
    if (id === wanted) return;
    wanted = id;
    const my = ++fadeSeq;
    const c = ctx;
    const begin = () => {
      theme = id;
      if (timer) { clearInterval(timer); timer = null; }
      if (id === 'none') return;
      const cc = ensure(); if (!cc) return;
      step = 0; nextT = cc.currentTime + 0.12;
      timer = setInterval(schedule, 40);
      if (musicBus) { musicBus.gain.setValueAtTime(0.0001, cc.currentTime); musicBus.gain.setTargetAtTime(0.22, cc.currentTime + 0.05, 0.5); }   // fade the new theme in
    };
    if (c && musicBus && theme !== 'none') {                 // crossfade: old theme out, then new theme in
      musicBus.gain.cancelScheduledValues(c.currentTime);
      musicBus.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
      setTimeout(() => { if (my === fadeSeq) begin(); }, 450);
    } else begin();
  },
  stop() { music.play('none'); },
  /** 1 = normal; <1 drags the beat (slow-motion moments) */
  tempo(m: number) { tempoMul = Math.max(0.15, Math.min(1.5, m)); },
  current: () => wanted,
};
