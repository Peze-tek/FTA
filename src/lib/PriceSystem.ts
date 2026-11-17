/**
 * PriceSystem — FAKE FAPCOIN price. No crypto, no wallets, just numbers going up.
 * $0.01 -> $1000 with a fixed 1,000,000 supply = $10K -> $1B market cap.
 */
export const START_PRICE = 0.01;
export const GOAL_PRICE = 1000;
export const SUPPLY = 1_000_000;

/** Level 1 recruits nudge the price so districts can unlock by price. */
export const DISTRICT_UNLOCK: Record<1 | 2 | 3 | 4, number> = { 1: 0.01, 2: 0.02, 3: 0.04, 4: 0.06 };

/** Price targets for the end of each level (spec). */
export const PRICE_TARGET = { l2: 3.2, l3: 28, l4: 89, l5: 1000 } as const;
/** Price the game (re)starts at when entering each level. */
export const LEVEL_START_PRICE: Record<number, number> = { 1: 0.01, 2: 0.06, 3: 3.2, 4: 28, 5: 89 };

export const marketCap = (p: number) => p * SUPPLY;
export const isDistrictUnlocked = (d: 1 | 2 | 3 | 4, peak: number) => peak >= DISTRICT_UNLOCK[d] - 1e-9;

export function formatPrice(p: number) {
  if (p < 0.1) return `$${p.toFixed(4)}`;
  if (p < 100) return `$${p.toFixed(2)}`;
  return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function formatCap(c: number) {
  if (c >= 1e9) return `$${(c / 1e9).toFixed(2)}B`;
  if (c >= 1e6) return `$${(c / 1e6).toFixed(2)}M`;
  if (c >= 1e3) return `$${(c / 1e3).toFixed(1)}K`;
  return `$${c.toFixed(0)}`;
}

export interface PumpOptions {
  /** ms */
  duration?: number;
  onTick?: (price: number) => void;
  onDone?: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * PricePump(old, new): animate the price from `oldPrice` to `newPrice`.
 * Upward pumps use a geometric (log-space) curve so $0.01 -> $1000 feels like a rocket,
 * with a little candle-noise on top. Returns a cancel function.
 */
export function PricePump(oldPrice: number, newPrice: number, opts: PumpOptions = {}): () => void {
  const duration = opts.duration ?? 2500;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;
  const up = newPrice >= oldPrice;
  const lo = Math.max(1e-6, oldPrice);
  const hi = Math.max(1e-6, newPrice);

  const frame = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / duration);
    const e = easeInOut(t);
    let p = up ? lo * Math.pow(hi / lo, e) : lo + (hi - lo) * e;
    if (t < 1) p *= 1 + Math.sin(now / 55) * 0.012 * (1 - t); // candle wiggle
    else p = newPrice;
    opts.onTick?.(p);
    if (t < 1) raf = requestAnimationFrame(frame);
    else opts.onDone?.();
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelled = true; cancelAnimationFrame(raf); };
}

export const pctChange = (from: number, to: number) => ((to - from) / from) * 100;
