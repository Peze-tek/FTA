'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { consume } from '@/lib/input';
import { playerState } from '@/lib/playerState';
import { useGame } from '@/lib/store';

export interface Interactable {
  id: string; x: number; z: number; radius: number; label: string;
  pos?: () => { x: number; z: number };   // for things that move (cars)
  enabled?: () => boolean; onUse: () => void;
}
const reg = new Map<string, Interactable>();

export function registerInteractable(i: Interactable) {
  reg.set(i.id, i);
  return () => { if (reg.get(i.id) === i) reg.delete(i.id); };
}

/** Finds the nearest usable interactable, publishes its prompt, fires it on the Interact button / E key. */
export function InteractionSystem() {
  const cur = useRef<string | null>(null);
  useFrame(() => {
    const s = useGame.getState();
    if (s.cutscene || s.dialogue || s.minigame) {
      if (cur.current !== null) { cur.current = null; s.setPrompt(null); }
      return; // dialogue box owns the interact press while it's open
    }
    if (playerState.driving) return;      // the vehicle owns the interact press while you drive
    const p = playerState.pos;
    let best: Interactable | null = null;
    let bd = Infinity;
    reg.forEach((i) => {
      if (i.enabled && !i.enabled()) return;
      const q = i.pos ? i.pos() : i;
      const d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d2 < i.radius * i.radius && d2 < bd) { best = i; bd = d2; }
    });
    const b = best as Interactable | null;
    const label = b ? b.label : null;
    if (label !== s.prompt) s.setPrompt(label);
    cur.current = b ? b.id : null;
    const pressed = consume('interact');
    if (pressed && b) b.onUse();
  });
  return null;
}
