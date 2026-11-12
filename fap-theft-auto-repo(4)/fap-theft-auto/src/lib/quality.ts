/** Graphics quality: LOW (phones that struggle) / MED (default on phones) / HIGH (desktop). Persisted locally. */
import { useEffect, useState } from 'react';

export type Quality = 'low' | 'med' | 'high';
const KEY = 'fta-gfx';
const listeners = new Set<(q: Quality) => void>();
let cur: Quality | null = null;

export function getQuality(): Quality {
  if (cur) return cur;
  try {
    const s = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (s === 'low' || s === 'med' || s === 'high') { cur = s; return cur; }
  } catch { /* private mode */ }
  const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
  cur = touch ? 'med' : 'high';
  return cur;
}
export function setQuality(q: Quality) {
  cur = q;
  try { window.localStorage.setItem(KEY, q); } catch { /* ignore */ }
  listeners.forEach((l) => l(q));
}
export function cycleQuality() { const o: Quality[] = ['low', 'med', 'high']; setQuality(o[(o.indexOf(getQuality()) + 1) % 3]); }
export function useQuality(): Quality {
  const [q, setQ] = useState<Quality>(() => (typeof window === 'undefined' ? 'med' : getQuality()));
  useEffect(() => { listeners.add(setQ); return () => { listeners.delete(setQ); }; }, []);
  return q;
}
export const QUALITY_INFO: Record<Quality, { dpr: number; shadow: number; shadowExt: number; clouds: boolean; aa: boolean; trees: number }> = {
  low:  { dpr: 1,   shadow: 0,    shadowExt: 0,  clouds: false, aa: false, trees: 0.45 },
  med:  { dpr: 1.5, shadow: 1024, shadowExt: 30, clouds: true,  aa: true , trees: 0.8 },
  high: { dpr: 2,   shadow: 2048, shadowExt: 38, clouds: true,  aa: true,  trees: 1 },
};
