import Horse from './Horse.jsx';
import { COLOR_MAP } from './colors.js';

export default function Track({ horses }) {
  const sortedByLane = [...horses].sort((a, b) => a.lane - b.lane);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm">
      {/* Distance markers */}
      <div className="pointer-events-none absolute inset-0 flex">
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute top-0 bottom-0 w-px bg-ink-100"
            style={{ left: `${p * 0.92}%` }}
          />
        ))}
      </div>

      {/* Finish line */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-3"
        style={{
          left: `92%`,
          backgroundImage:
            'repeating-linear-gradient(45deg, #1d1d1f 0 6px, #ffffff 6px 12px)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        }}
      />

      {/* Lanes */}
      <div className="flex h-full flex-col">
        {sortedByLane.map((horse, i) => {
          const c = COLOR_MAP[horse.color];
          const isPlayer = horse.isPlayer;
          return (
            <div
              key={horse.id}
              className={[
                'relative flex-1',
                i > 0 ? 'border-t border-dashed border-ink-100' : '',
                isPlayer ? 'bg-ink-50/60' : '',
              ].join(' ')}
            >
              {/* Lane label */}
              <div className="pointer-events-none absolute left-2 top-1/2 z-0 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                <span className={`rounded px-1.5 py-0.5 ${c.bgSoft} ${c.text}`}>
                  {horse.lane + 1}
                </span>
              </div>
              <Horse horse={horse} isPlayer={isPlayer} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
