import { Trophy } from 'lucide-react';
import { COLOR_MAP } from './colors.js';

// `entries` comes from buildLeaderboardList (in src/game/visible.js):
// rank-ordered list with role-based colors already applied. The
// player's own pill uses YOU_COLOR (amber); others use rank colors.
//
// We don't render every horse in a 150-player room — just the top 5
// (with the player swapped in if they're outside it) so the bar
// stays scannable.

export default function Leaderboard({ entries }) {
  const list = entries || [];

  return (
    <div className="flex h-full items-center gap-2 rounded-2xl border border-ink-100 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
      <Trophy size={16} className="shrink-0 text-amber-500" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {list.map((h) => {
          const c = COLOR_MAP[h.color] || COLOR_MAP.sky;
          return (
            <div
              key={h.id}
              className={[
                'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
                h.isPlayer ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-900',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] opacity-70">
                #{h.rank ?? '?'}
              </span>
              <span className={`h-2 w-2 rounded-full ${c.bg}`} />
              <span className="max-w-[72px] truncate">{h.name}</span>
              <span className="font-mono text-[10px] opacity-70">
                {Math.floor(h.position ?? 0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
