/* Telegram WebApp SDK wrapper: ready/expand, haptics, CloudStorage (with localStorage fallback). */

interface TgHaptics {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}
interface TgCloud {
  setItem(k: string, v: string, cb?: (err: unknown, ok?: boolean) => void): void;
  getItem(k: string, cb: (err: unknown, v?: string) => void): void;
}
interface TgWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: TgHaptics;
  CloudStorage?: TgCloud;
  initDataUnsafe?: { user?: { first_name?: string; username?: string } };
  platform?: string;
  version?: string;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg = (): TgWebApp | undefined =>
  typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.disableVerticalSwipes?.(); // stops swipe-down-to-close while dragging the camera
    w.setHeaderColor?.('#07040f');
    w.setBackgroundColor?.('#07040f');
    if (['android', 'ios'].includes(w.platform ?? '')) w.requestFullscreen?.();
  } catch { /* old clients */ }
}

export const telegramUser = () => tg()?.initDataUnsafe?.user?.first_name ?? null;

export const haptic = {
  impact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
    try { tg()?.HapticFeedback?.impactOccurred(style); } catch { /* ignore */ }
  },
  notify(type: 'error' | 'success' | 'warning' = 'success') {
    try { tg()?.HapticFeedback?.notificationOccurred(type); } catch { /* ignore */ }
  },
  select() {
    try { tg()?.HapticFeedback?.selectionChanged(); } catch { /* ignore */ }
  },
};

const KEY = 'fta-save-v1';

export function cloudSave(data: unknown) {
  const s = JSON.stringify(data);
  try { localStorage.setItem(KEY, s); } catch { /* ignore */ }
  try { tg()?.CloudStorage?.setItem(KEY, s); } catch { /* ignore */ }
}

export function cloudLoad<T>(): Promise<T | null> {
  return new Promise((resolve) => {
    const local = () => {
      try {
        const s = localStorage.getItem(KEY);
        resolve(s ? (JSON.parse(s) as T) : null);
      } catch { resolve(null); }
    };
    const cs = tg()?.CloudStorage;
    if (!cs) return local();
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; local(); } }, 1200);
    try {
      cs.getItem(KEY, (err, v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (!err && v) { try { resolve(JSON.parse(v) as T); return; } catch { /* fallthrough */ } }
        local();
      });
    } catch { clearTimeout(t); local(); }
  });
}
