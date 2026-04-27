import { Trophy, RotateCcw, Medal } from 'lucide-react';
import { COLOR_MAP } from './colors.js';

const RANK_LABEL = ['1st', '2nd', '3rd', '4th', '5th'];
const PODIUM_HEIGHTS = ['h-28', 'h-20', 'h-16']; // for 1st, 2nd, 3rd
const PODIUM_TINTS = [
  'bg-amber-400 text-amber-900',
  'bg-ink-200 text-ink-900',
  'bg-orange-300 text-orange-900',
];

export default function Results({ ranking, startedAt, onPlayAgain }) {
  const playerRank = ranking.findIndex((h) => h.isPlayer);
  const playerEntry = ranking[playerRank];
  const top3 = ranking.slice(0, 3);
  // Visual order on the podium: 2nd | 1st | 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
  const podiumIndex = (h) => top3.indexOf(h); // 0-based gold/silver/bronze

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
            You finished{' '}
            <span className="font-semibold text-ink-900">
              {RANK_LABEL[playerRank] || '—'}
            </span>{' '}
            · {fmtTime(playerEntry)}
          </div>
        </div>

        {/* Podium */}
        <div className="mt-3 flex items-end justify-center gap-3">
          {podiumOrder.map((h) => {
            if (!h) return null;
            const idx = podiumIndex(h);
            const c = COLOR_MAP[h.color];
            return (
              <div key={h.id} className="flex w-24 flex-col items-center gap-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  {RANK_LABEL[idx]}
                </div>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${c.bg} text-2xl shadow-md ring-4 ring-white`}
                >
                  🐎
                </div>
                <div className="max-w-full truncate text-center text-xs font-semibold text-ink-900">
                  {h.name}
                </div>
                <div className="font-mono text-[10px] text-ink-400">
                  {fmtTime(h)}
                </div>
                <div
                  className={[
                    'mt-1 flex w-full items-start justify-center rounded-t-xl pt-2 text-[11px] font-bold tracking-wider',
                    PODIUM_HEIGHTS[idx],
                    PODIUM_TINTS[idx],
                  ].join(' ')}
                >
                  <Medal size={14} className="mr-1" />
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>

        {/* Full standings */}
        <div className="mt-4 space-y-1.5">
          {ranking.map((h, i) => {
            const c = COLOR_MAP[h.color];
            return (
              <div
                key={h.id}
                className={[
                  'flex items-center gap-3 rounded-2xl border px-3 py-2',
                  h.isPlayer
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-100 bg-white text-ink-900',
                ].join(' ')}
              >
                <div
                  className={[
                    'flex h-7 w-12 items-center justify-center rounded-full text-[11px] font-bold',
                    h.isPlayer
                      ? 'bg-white/15 text-white'
                      : i === 0
                        ? 'bg-amber-100 text-amber-700'
                        : i === 1
                          ? 'bg-ink-100 text-ink-700'
                          : i === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-ink-50 text-ink-400',
                  ].join(' ')}
                >
                  {RANK_LABEL[i]}
                </div>
                <div className={`h-3 w-3 rounded-full ${c.bg}`} />
                <div className="flex-1 truncate font-medium">{h.name}</div>
                <div className="font-mono text-xs opacity-70">{fmtTime(h)}</div>
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
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 py-3.5 text-base font-semibold text-white shadow-lg shadow-ink-900/20 active:scale-[0.99]"
        >
          <RotateCcw size={18} />
          Race Again
        </button>
      </div>
    </div>
  );
}
