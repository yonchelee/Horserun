import { Trophy } from 'lucide-react';
import { COLOR_MAP } from './colors.js';
import { rankHorses } from '../game/engine.js';

const RANK_LABEL = ['1st', '2nd', '3rd', '4th', '5th'];

export default function Leaderboard({ horses }) {
  const ranked = rankHorses(horses);

  return (
    <div className="flex h-full items-center gap-2 rounded-2xl border border-ink-100 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
      <Trophy size={16} className="shrink-0 text-amber-500" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {ranked.map((h, i) => {
          const c = COLOR_MAP[h.color];
          return (
            <div
              key={h.id}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
                h.isPlayer ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-900',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] opacity-70">
                {RANK_LABEL[i]}
              </span>
              <span className={`h-2 w-2 rounded-full ${c.bg}`} />
              <span className="max-w-[72px] truncate">{h.name}</span>
              <span className="font-mono text-[10px] opacity-70">
                {Math.floor(h.position)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
