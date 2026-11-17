'use client';
import { useEffect, useState } from 'react';
import { isTouchDevice } from '@/lib/input';
import { tg } from '@/lib/telegram';

/** True on phones/tablets (touch overlay is used), so we can require landscape play. */
export function isMobilePlay() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('touch') === '1';
  return q || isTouchDevice() || ['android', 'ios'].includes(tg()?.platform ?? '');
}

/** Ask the OS/Telegram to lock the screen sideways (best effort — only some clients allow it). */
export function tryLockLandscape() {
  try { tg()?.lockOrientation?.(); } catch { /* older Telegram */ }
  try {
    const o = (screen as Screen & { orientation?: { lock?: (t: string) => Promise<void> } }).orientation;
    o?.lock?.('landscape')?.catch(() => { /* needs fullscreen; the rotate screen covers the rest */ });
  } catch { /* unsupported */ }
}

/** true while a mobile player holds the phone upright: the game pauses and a "turn sideways" screen is shown. */
export function useNeedsRotate() {
  const [need, setNeed] = useState(false);
  useEffect(() => {
    const check = () => setNeed(isMobilePlay() && window.innerHeight > window.innerWidth * 1.02);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);
  return need;
}
