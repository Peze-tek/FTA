'use client';
import { useEffect, useRef } from 'react';
import { nav } from '@/lib/nav';
import { playerState } from '@/lib/playerState';
import { useGame } from '@/lib/store';
import { isDistrictUnlocked } from '@/lib/PriceSystem';

/** Full-screen, north-up map. Opening it pauses the game (HUD sets store.paused). */
export default function FullMap({ onClose }: { onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = cv.current!;
    const W = Math.min(window.innerWidth - 24, 960), H = Math.min(window.innerHeight - 110, 600);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    const x = c.getContext('2d')!; x.scale(dpr, dpr);
    const px = playerState.pos.x, pz = playerState.pos.z;
    // world extents: every layout rect, else a window around the player
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of nav.rects) { x0 = Math.min(x0, r.x - r.w / 2); x1 = Math.max(x1, r.x + r.w / 2); z0 = Math.min(z0, r.z - r.d / 2); z1 = Math.max(z1, r.z + r.d / 2); }
    if (!isFinite(x0) || x1 - x0 > 900) { x0 = px - nav.range * 1.4; x1 = px + nav.range * 1.4; z0 = pz - nav.range * 1.4; z1 = pz + nav.range * 1.4; }
    const pad = 14, k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oz = (H - (z1 - z0) * k) / 2 - z0 * k;
    const S = (wx: number, wz: number): [number, number] => [ox + wx * k, oz + wz * k];
    const peak = useGame.getState().peakPrice;

    x.fillStyle = '#0c0e1a'; x.fillRect(0, 0, W, H);
    for (const r of nav.rects) {
      let a = 1;
      if (r.district) {
        const open = isDistrictUnlocked(r.district as 1 | 2 | 3 | 4, peak);
        if (r.lockedOnly && open) continue;
        if (!r.lockedOnly && !open) a = 0.3;
      }
      const [ax, az] = S(r.x - r.w / 2, r.z - r.d / 2);
      x.globalAlpha = a; x.fillStyle = r.color; x.fillRect(ax, az, r.w * k, r.d * k);
    }
    x.globalAlpha = 1;
    for (const m of nav.markers) {
      const [mx, mz] = S(m.x, m.z);
      x.fillStyle = m.color; x.beginPath(); x.arc(mx, mz, m.kind === 'enemy' ? 3.5 : 3, 0, Math.PI * 2); x.fill();
      if (m.kind === 'enemy') { x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 1; x.stroke(); }
    }
    const tg = nav.target;
    if (tg) {
      const [tx, tz] = S(tg.x, tg.z);
      x.strokeStyle = tg.color; x.lineWidth = 2.5; x.beginPath(); x.arc(tx, tz, 9, 0, Math.PI * 2); x.stroke();
      x.fillStyle = tg.color; x.beginPath(); x.arc(tx, tz, 4.5, 0, Math.PI * 2); x.fill();
      x.font = '700 12px Arial, sans-serif'; x.textAlign = 'center'; x.fillText(tg.label, tx, tz - 15);
    }
    // player arrow (facing direction: forward = (sin f, cos f) in world x,z)
    const [ux, uz] = S(px, pz), f = playerState.facing, ang = Math.atan2(Math.cos(f), Math.sin(f));
    x.save(); x.translate(ux, uz); x.rotate(ang);
    x.fillStyle = '#fff'; x.strokeStyle = '#22d3ee'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(11, 0); x.lineTo(-7, -7); x.lineTo(-3, 0); x.lineTo(-7, 7); x.closePath(); x.fill(); x.stroke();
    x.restore();
    x.fillStyle = '#ff2d55'; x.font = '900 13px Arial Black, Impact, sans-serif'; x.textAlign = 'left'; x.fillText('N ↑', 12, 20);
  }, []);

  const meters = nav.target ? Math.round(Math.hypot(nav.target.x - playerState.pos.x, nav.target.z - playerState.pos.z)) : 0;
  return (
    <div data-ui className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-3">
      <div className="text-center">
        <div className="font-game text-xl tracking-[0.4em] text-white">PAUSED</div>
        {nav.target && <div className="text-[11px] text-white/60">{nav.target.label} · {meters}m</div>}
      </div>
      <canvas ref={cv} className="rounded-xl border border-white/20" />
      <div className="flex gap-3">
        <button className="rounded-xl bg-fap px-8 py-2.5 font-game text-black active:scale-95" onClick={onClose}>RESUME</button>
        <button className="rounded-xl bg-white/10 px-6 py-2.5 font-game text-white active:scale-95" onClick={() => { onClose(); useGame.getState().toMenu(); }}>MENU</button>
      </div>
    </div>
  );
}
