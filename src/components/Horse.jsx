import { Flame } from 'lucide-react';
import { COLOR_MAP } from './colors.js';
import { TRACK_LENGTH } from '../game/engine.js';

export default function Horse({ horse, isPlayer, now }) {
  const c = COLOR_MAP[horse.color] || COLOR_MAP.sky;
  const overheating = horse.overheatUntil > now;
  const finished = horse.finished;
  const moving = horse.speed > 0.6 && !overheating;

  // Reserve 8% of track width on the right for the finish line + horse icon.
  const pct = (horse.position / TRACK_LENGTH) * 92;

  return (
    <div className="absolute inset-y-0 left-0 right-0 flex items-center">
      <div
        className="relative will-change-transform"
        style={{
          transform: `translateX(${pct}%)`,
          transition: 'transform 80ms linear',
          paddingLeft: '8px',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className={[
              'relative flex h-9 w-9 items-center justify-center rounded-full',
              c.bg,
              'shadow-lg',
              c.shadow,
              isPlayer ? 'ring-4 ring-white' : 'ring-2 ring-white/70',
              moving ? 'animate-gallop' : '',
              finished ? 'opacity-90' : '',
            ].join(' ')}
          >
            <span className="text-xl leading-none" style={{ filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.15))' }}>
              🐎
            </span>

            {overheating && (
              <>
                <span className="pointer-events-none absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white">
                  <Flame size={12} className="text-white" />
                </span>
                <span
                  className="pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sky-400 animate-sweat"
                />
              </>
            )}
          </div>

          {isPlayer && !finished && (
            <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
              You
            </span>
          )}
          {finished && (
            <span className={`rounded-full ${c.bgSoft} ${c.text} px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider`}>
              Done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
