import { Trophy, RotateCcw } from 'lucide-react';
import { COLOR_MAP } from './colors.js';

const RANK_LABEL = ['1st', '2nd', '3rd', '4th', '5th'];
const RANK_ACCENT = [
  'bg-amber-100 text-amber-700',
  'bg-ink-100 text-ink-600',
  'bg-orange-100 text-orange-700',
  'bg-ink-50 text-ink-400',
  'bg-ink-50 text-ink-400',
];

export default function Results({ ranking, startedAt, onPlayAgain }) {
  const playerEntry = ranking.find((h) => h.isPlayer);
  const playerRank = ranking.findIndex((h) => h.isPlayer);
  const winnerTime =
    ranking[0]?.finishedAt && startedAt
      ? ((ranking[0].finishedAt - startedAt) / 1000).toFixed(2)
      : '—';

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-ink-100 bg-white px-6 py-6 shadow-xl">
        <div className="flex items-center gap-2 text-amber-500">
          <Trophy size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
            Race finished
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
            {playerEntry?.name || 'You'} —{' '}
            <span className="text-ink-400">{RANK_LABEL[playerRank] || '—'}</span>
          </h2>
          <div className="text-xs text-ink-400">
            Winner <span className="font-mono text-ink-900">{winnerTime}s</span>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          {ranking.map((h, i) => {
            const c = COLOR_MAP[h.color];
            const t =
              h.finishedAt && startedAt
                ? ((h.finishedAt - startedAt) / 1000).toFixed(2)
                : null;
            return (
              <div
                key={h.id}
                className={[
                  'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                  h.isPlayer
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-100 bg-white text-ink-900',
                ].join(' ')}
              >
                <div
                  className={`flex h-7 w-12 items-center justify-center rounded-full text-[11px] font-bold ${
                    h.isPlayer ? 'bg-white/15 text-white' : RANK_ACCENT[i]
                  }`}
                >
                  {RANK_LABEL[i]}
                </div>
                <div className={`h-3 w-3 rounded-full ${c.bg}`} />
                <div className="flex-1 truncate font-medium">{h.name}</div>
                <div className="font-mono text-xs opacity-70">
                  {t ? `${t}s` : 'DNF'}
                </div>
                <div className="font-mono text-xs opacity-70">
                  {h.tapCount} taps
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 py-3.5 text-base font-semibold text-white shadow-lg shadow-ink-900/20 active:scale-[0.99]"
        >
          <RotateCcw size={18} />
          Race Again
        </button>
      </div>
    </div>
  );
}
