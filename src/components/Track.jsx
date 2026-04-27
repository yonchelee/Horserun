import Horse from './Horse.jsx';
import { COLOR_MAP } from './colors.js';

export default function Track({ horses }) {
  const sortedByLane = [...horses].sort((a, b) => a.lane - b.lane);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-3xl shadow-sm"
      style={{
        // Vivid race-turf gradient: brighter at top, darker at the
        // edges. The repeating-linear-gradient layered on top adds the
        // subtle "mowed strips" pattern real horse tracks have.
        backgroundImage: [
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 24px, rgba(0,0,0,0.04) 24px 48px)',
          'linear-gradient(180deg, #4ade80 0%, #22c55e 40%, #16a34a 100%)',
        ].join(', '),
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), inset 0 12px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* Distance markers — faint white poles every 25%. */}
      <div className="pointer-events-none absolute inset-0 flex">
        {[0, 25, 50, 75].map((p) => (
          <div
            key={p}
            className="absolute top-0 bottom-0 w-px bg-white/25"
            style={{ left: `${p * 0.92}%` }}
          />
        ))}
      </div>

      {/* Finish line — checkered black/white. */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-3"
        style={{
          left: `92%`,
          backgroundImage:
            'repeating-linear-gradient(45deg, #1d1d1f 0 6px, #ffffff 6px 12px)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
        }}
      />

      {/* Lanes painted directly on the turf with white dashed dividers. */}
      <div className="flex h-full flex-col">
        {sortedByLane.map((horse, i) => {
          const c = COLOR_MAP[horse.color];
          const isPlayer = horse.isPlayer;
          return (
            <div
              key={horse.id}
              className={[
                'relative flex-1',
                i > 0 ? 'border-t-2 border-dashed border-white/55' : '',
                isPlayer ? 'bg-white/5' : '',
              ].join(' ')}
            >
              {/* Lane number bib pinned to the inside-left rail. */}
              <div className="pointer-events-none absolute left-2 top-1/2 z-0 -translate-y-1/2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${c.bg} text-[10px] font-bold text-white shadow ring-2 ring-white/80`}
                >
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
