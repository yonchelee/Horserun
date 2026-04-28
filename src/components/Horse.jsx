import { COLOR_MAP } from './colors.js';
import { TRACK_LENGTH } from '../game/engine.js';
import SpriteHorse from './SpriteHorse.jsx';

export default function Horse({ horse, isPlayer }) {
  const c = COLOR_MAP[horse.color] || COLOR_MAP.sky;
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
          // 100ms matches the server tick (10Hz) so position updates
          // animate continuously between snapshots — CSS transition
          // is doing our lerp for us.
          transition: 'left 100ms linear',
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
                paused={finished}
                dimmed={finished}
              />

              {/* Lane number bib (mirrors the "1" patch on the sprite). */}
              <span
                className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full ${c.bg} px-1.5 py-px text-[9px] font-bold leading-tight text-white shadow ring-1 ring-white/80`}
              >
                {horse.rank ? `#${horse.rank}` : horse.lane + 1}
              </span>
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
