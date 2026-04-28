import { Trophy, RotateCcw, Medal } from 'lucide-react';
import { COLOR_MAP } from './colors.js';
import { buildLeaderboardList, YOU_COLOR } from '../game/visible.js';

const RANK_LABEL = ['1st', '2nd', '3rd', '4th', '5th'];
const PODIUM_HEIGHTS = ['h-28', 'h-20', 'h-16']; // for 1st, 2nd, 3rd
const PODIUM_TINTS = [
  'bg-amber-400 text-amber-900',
  'bg-ink-200 text-ink-900',
  'bg-orange-300 text-orange-900',
];

// Results screen for compact (top + you) payload. With 150 racers we
// don't list everyone; we show the top 5 podium plus the player's own
// finish — which the server provides in `you` (with rank).
export default function Results({ top, you, startedAt, finishedAt, totalCount, onPlayAgain }) {
  const entries = buildLeaderboardList(you, top || []);
  const top3 = (top || []).slice(0, 3);
  // Visual order on the podium: 2nd | 1st | 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumIndex = (h) => top3.indexOf(h); // 0-based gold/silver/bronze

  const youInTop = !!(top || []).find((h) => h.id === you?.id);
  const youColor = COLOR_MAP[YOU_COLOR];

  const fmtTime = (h) =>
    h?.finishedAt && startedAt
      ? `${((h.finishedAt - startedAt) / 1000).toFixed(2)}s`
      : 'DNF';

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-2xl rounded-3xl border border-ink-100 bg-white px-6 py-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-500">
            <Trophy size={16} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
              Race finished
            </span>
          </div>
          <div className="text-xs text-ink-400">
            {totalCount > 0 ? `${totalCount} 명 중 ` : ''}
            <span className="font-semibold text-ink-900">
              {you?.rank ? `#${you.rank}` : '—'}
            </span>{' '}
            · {fmtTime(you)}
          </div>
        </div>

        {/* Podium — 2nd | 1st | 3rd visual order. Heights: 1st tallest */}
        {podiumOrder.length > 0 && (
          <div className="mt-5 flex items-end justify-center gap-3">
            {podiumOrder.map((h) => {
              const place = podiumIndex(h); // 0=gold,1=silver,2=bronze
              const pillTint = PODIUM_TINTS[place] || 'bg-ink-100 text-ink-900';
              const podiumHeight = PODIUM_HEIGHTS[place] || 'h-12';
              const c = COLOR_MAP[h.color] || COLOR_MAP.sky;
              return (
                <div key={h.id} className="flex flex-col items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${c.bg} text-sm font-bold text-white shadow ring-2 ring-white/80`}>
                      <Medal size={16} />
                    </div>
                    <span className="mt-1 max-w-[110px] truncate text-xs font-semibold text-ink-900">
                      {h.name}
                    </span>
                  </div>
                  <div
                    className={[
                      'flex w-20 items-start justify-center rounded-t-2xl pt-2',
                      podiumHeight,
                      pillTint,
                    ].join(' ')}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {RANK_LABEL[place]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Top-5 list */}
        <div className="mt-4 space-y-1.5">
          {entries.map((h) => {
            const c = COLOR_MAP[h.color] || COLOR_MAP.sky;
            return (
              <div
                key={h.id}
                className={[
                  'flex items-center gap-2 rounded-2xl border px-3 py-2',
                  h.isPlayer
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-100 bg-white text-ink-900',
                ].join(' ')}
              >
                <span className="font-mono text-[10px] opacity-70">
                  #{h.rank ?? '?'}
                </span>
                <span className={`h-2 w-2 rounded-full ${c.bg}`} />
                <span className="flex-1 truncate font-medium">{h.name}</span>
                <span className="font-mono text-[10px] opacity-70">
                  {Math.floor(h.position ?? 0)}%
                </span>
              </div>
            );
          })}

          {/* If you're outside top 5 — leaderboard already includes you,
              so this is just a fallback note. */}
          {!youInTop && you?.rank && you.rank > entries.length && (
            <div className="rounded-2xl bg-ink-50 px-3 py-2 text-center text-[11px] text-ink-400">
              You finished #{you.rank} of {totalCount}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 py-3.5 text-base font-semibold text-white shadow-lg shadow-ink-900/20 active:scale-[0.99]"
        >
          <RotateCcw size={18} strokeWidth={2.5} />
          Back to lobby
        </button>
      </div>
    </div>
  );
}
