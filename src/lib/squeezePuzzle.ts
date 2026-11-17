import { rng } from '@/lib/rng';

export interface ShortPos { id: string; name: string; entry: number; lev: number; size: number; liq: number }

/** Bears' leveraged shorts. liq = entry * (1 + 1/lev). Player must liquidate in ascending liq order. */
export function makeSqueezeRound(seed: number, n = 6): ShortPos[] {
  const r = rng(seed);
  const names = ['BULL_BEAR_01', 'WHALE_SHORT', 'DOOMER.eth', 'PUT_EVERYTHING', 'FUD_FARM', 'GRIZZLY_LP', 'RED_CANDLE_CO', 'BEAR_TWIN_B'];
  const out: ShortPos[] = [];
  const used = new Set<string>();
  while (out.length < n) {
    const entry = Math.round((2.4 + r() * 1.2) * 100) / 100;
    const lev = [2, 3, 4, 5, 8, 10, 20][Math.floor(r() * 7)];
    const liq = Math.round(entry * (1 + 1 / lev) * 1000) / 1000;
    const key = liq.toFixed(2);
    if (used.has(key)) continue; // keep every liq price distinct to 2dp
    used.add(key);
    out.push({ id: 'p' + out.length, name: names[out.length % names.length], entry, lev, size: Math.round((0.4 + r() * 4) * 10) / 10, liq });
  }
  return out;
}
export const liqOrder = (ps: ShortPos[]) => [...ps].sort((a, b) => a.liq - b.liq).map((p) => p.id);
