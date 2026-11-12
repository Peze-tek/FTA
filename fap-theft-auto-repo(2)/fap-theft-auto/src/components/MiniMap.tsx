'use client';
import { useEffect, useRef } from 'react';
import { nav } from '@/lib/nav';
import { playerState } from '@/lib/playerState';
import { useGame } from '@/lib/store';
import { isDistrictUnlocked } from '@/lib/PriceSystem';

const SIZE = 112;

/**
 * GTA-style circular radar. Rotates with the camera (up = where you're looking), shows the level layout,
 * points of interest, enemies, and a pulsing guide marker for the current objective. When the objective is
 * off the map, an arrow on the rim points the way and the pill below shows the distance.
 */
/** GTA-style health (green) + armour (blue = rage in the brawl) bars under the radar. */
function RadarBars() {
  const level = useGame((s) => s.level);
  const f = useGame((s) => s.fight);
  if ((level !== 3 && level !== 5) || f.maxHp <= 0) return null;
  const hp = Math.max(0, Math.min(1, f.hp / f.maxHp));
  const low = hp < 0.3;
  return (
    <div className="mt-1 w-[122px]">
      <div className="relative h-[9px] overflow-hidden rounded-[2px] border border-black bg-black/70">
        <div className={`h-full ${low ? 'animate-pulse bg-rug' : 'bg-[#3ddc6a]'}`} style={{ width: `${hp * 100}%`, transition: 'width .15s' }} />
      </div>
      {level === 3 && (
        <div className="mt-[2px] h-[5px] overflow-hidden rounded-[2px] border border-black bg-black/70">
          <div className="h-full bg-[#4da3ff]" style={{ width: `${f.meastLeft > 0 ? (f.meastLeft / 5) * 100 : f.rage}%`, transition: 'width .12s' }} />
        </div>
      )}
    </div>
  );
}

export default function MiniMap({ onOpen }: { onOpen?: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const pill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = cv.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = SIZE * dpr; c.height = SIZE * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const R = SIZE / 2;
    let raf = 0, last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return; // ~30fps is plenty for a radar
      last = t;

      const scale = (R - 4) / nav.range;
      const yaw = playerState.yaw;
      const th = -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw)); // rotate so "forward" is up
      const ct = Math.cos(th), st = Math.sin(th);
      const px = playerState.pos.x, pz = playerState.pos.z;
      const S = (x: number, z: number): [number, number] => {
        const dx = x - px, dz = z - pz;
        return [R + (dx * ct - dz * st) * scale, R + (dx * st + dz * ct) * scale];
      };
      const peak = useGame.getState().peakPrice;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = 'rgba(14,16,28,0.9)'; ctx.fillRect(0, 0, SIZE, SIZE);

      // level layout
      for (const r of nav.rects) {
        let alpha = 1;
        if (r.district) {
          const open = isDistrictUnlocked(r.district as 1 | 2 | 3 | 4, peak);
          if (r.lockedOnly && open) continue;
          if (!r.lockedOnly && !open) alpha = 0.3;
        }
        if (Math.hypot(r.x - px, r.z - pz) > nav.range * 1.5 + Math.max(r.w, r.d)) continue;
        const hw = r.w / 2, hd = r.d / 2;
        const p1 = S(r.x - hw, r.z - hd), p2 = S(r.x + hw, r.z - hd), p3 = S(r.x + hw, r.z + hd), p4 = S(r.x - hw, r.z + hd);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // route to the objective (dotted): along the street in the city, through corridors in the maze
      if (nav.target) {
        const tg0 = nav.target;
        const pts = nav.routeMode === 'path'
          ? nav.route
          : [{ x: px, z: pz }, { x: px, z: 0 }, { x: tg0.x, z: 0 }, { x: tg0.x, z: tg0.z }];
        if (pts && pts.length > 1) {
          ctx.strokeStyle = tg0.color; ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]); ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
          ctx.beginPath();
          const a0 = S(px, pz); ctx.moveTo(a0[0], a0[1]);
          for (const p of pts) { const q = S(p.x, p.z); ctx.lineTo(q[0], q[1]); }
          ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }

      // markers
      for (const m of nav.markers) {
        const [x, y] = S(m.x, m.z);
        if (Math.hypot(x - R, y - R) > R - 4) continue;
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(x, y, m.kind === 'enemy' ? 3 : 2.5, 0, Math.PI * 2); ctx.fill();
        if (m.kind === 'enemy') { ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke(); }
      }

      // objective guide
      const tg = nav.target;
      let txt = '';
      if (tg) {
        const [x, y] = S(tg.x, tg.z);
        const dx = x - R, dy = y - R, dist = Math.hypot(dx, dy);
        const pulse = 0.5 + 0.5 * Math.sin(t / 220);
        if (dist < R - 9) {
          ctx.strokeStyle = tg.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.4 + pulse * 0.5;
          ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = tg.color;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        } else {
          const a = Math.atan2(dy, dx), rr = R - 10;
          const ax = R + Math.cos(a) * rr, ay = R + Math.sin(a) * rr;
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
          ctx.fillStyle = tg.color; ctx.globalAlpha = 0.7 + pulse * 0.3;
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        const meters = Math.round(Math.hypot(tg.x - px, tg.z - pz));
        txt = `${tg.label} · ${meters}m`;
        if (pill.current) pill.current.style.color = tg.color;
      }
      if (pill.current && pill.current.textContent !== txt) pill.current.textContent = txt;

      // player (always centre, always pointing up)
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R + 5, R + 5); ctx.lineTo(R, R + 2); ctx.lineTo(R - 5, R + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      // north marker on the rim (the radar rotates with the camera)
      {
        const na = Math.atan2(-ct, st), nx = R + Math.cos(na) * (R - 9), ny = R + Math.sin(na) * (R - 9);
        ctx.fillStyle = '#ff2d55'; ctx.beginPath(); ctx.arc(nx, ny, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '900 9px Arial Black, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny + 0.5);
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute left-2 top-[max(8px,env(safe-area-inset-top))] flex flex-col items-start">
      <div data-ui role="button" aria-label="Open map (pauses the game)" onClick={onOpen} className="pointer-events-auto relative cursor-pointer active:scale-95" style={{ width: SIZE + 10, height: SIZE + 10 }}>
        <div className="absolute inset-0 rounded-full border-[3px] border-white/85 shadow-[0_0_0_2px_rgba(0,0,0,.7),0_4px_14px_rgba(0,0,0,.6)]" />
        <canvas ref={cv} style={{ width: SIZE, height: SIZE }} className="absolute left-[5px] top-[5px] rounded-full" />
      </div>
      <RadarBars />
      <div ref={pill} className="gta-text mt-1 max-w-[150px] truncate text-[10px] tracking-wide" />
    </div>
  );
}
