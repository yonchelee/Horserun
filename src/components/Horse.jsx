import { Flame } from 'lucide-react';
import { COLOR_MAP } from './colors.js';
import { TRACK_LENGTH } from '../game/engine.js';
import SpriteHorse from './SpriteHorse.jsx';

export default function Horse({ horse, isPlayer, now }) {
  const c = COLOR_MAP[horse.color] || COLOR_MAP.sky;
  const overheating = horse.overheatUntil > now;
  const finished = horse.finished;

  // Reserve 8% of track width on the right for the finish line + horse icon.
  const pct = (horse.position / TRACK_LENGTH) * 92;

  return (
    <div className="absolute inset-y-0 left-0 right-0">
      <div
        className="absolute top-1/2 -translate-y-1/2 will-change-[left]"
        style={{
          // Position relative to the LANE width, not the inner element's
          // own width. Using `left: %` here is the fix; previously we
          // used translateX(${pct}%) which is element-relative, so the
          // horse only shifted by ~pct% of its own ~100px content width
          // and never reached the finish line.
          left: `calc(${pct}% + 4px)`,
          transition: 'left 80ms linear',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center justify-center">
            {/* Soft player highlight under the sprite */}
            {isPlayer && (
              <span
                className="pointer-events-none absolute inset-0 -m-1 rounded-full bg-white/70 shadow-md ring-2 ring-ink-900/20"
                style={{ filter: 'blur(0.5px)' }}
              />
            )}

            <span className="relative">
              <SpriteHorse
                lane={horse.lane}
                speed={horse.speed}
                size={56}
                paused={overheating || finished}
                dimmed={finished}
              />

              {/* Lane number bib (mirrors the "1" patch on the sprite). */}
              <span
                className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full ${c.bg} px-1.5 py-px text-[9px] font-bold leading-tight text-white shadow ring-1 ring-white/80`}
              >
                {horse.lane + 1}
              </span>

              {overheating && (
                <>
                  <span className="pointer-events-none absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white">
                    <Flame size={12} className="text-white" />
                  </span>
                  <span className="pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sky-400 animate-sweat" />
                </>
              )}
            </span>
          </div>

          {isPlayer && !finished && (
            <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
              You
            </span>
          )}
          {finished && (
            <span
              className={`rounded-full ${c.bgSoft} ${c.text} px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider`}
            >
              Done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
