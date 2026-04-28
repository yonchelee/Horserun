import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut, Users, Timer, Bot } from 'lucide-react';
import { COLOR_MAP } from './colors.js';

// Pure-presentational lobby. The snapshot (with phase / horses /
// countdownEndsAt) comes from the network; we just render it and
// surface the Ready button.

export default function Lobby({ snapshot, myConnId, serverNow, onReady, onLeave, isAdmin, onReset }) {
  const horses = snapshot?.horses || [];
  const phase = snapshot?.phase || 'lobby';
  const countdownEndsAt = snapshot?.countdownEndsAt;

  const [now, setNow] = useState(() => serverNow?.() ?? Date.now());
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setInterval(() => setNow(serverNow?.() ?? Date.now()), 100);
    return () => clearInterval(id);
  }, [phase, serverNow]);

  const sortedHorses = [...horses].sort((a, b) => a.lane - b.lane);
  const youHorse = myConnId ? horses.find((h) => h.connId === myConnId) : null;
  const youReady = youHorse?.ready;

  const readyCount = horses.filter((h) => h.ready).length;
  const totalCount = horses.length;
  const remainingSec =
    phase === 'countdown' && countdownEndsAt
      ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000))
      : null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-3xl border border-ink-100 bg-white px-5 py-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-400">
            <Users size={14} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
              Lobby · {readyCount}/{totalCount} ready
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded-full bg-yellow-100 px-2 py-1 font-mono text-[10px] text-yellow-900">
              dbg: name=&quot;{youHorse?.name ?? 'null'}&quot; admin=
              {youHorse ? (youHorse.isAdmin ? 'Y' : 'N') : 'no-horse'}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200"
              >
                강제 초기화
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-ink-400 hover:bg-ink-50"
            >
              <LogOut size={12} />
              Leave
            </button>
          </div>
        </div>

        {/* Player list */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {sortedHorses.map((p) => {
            const c = COLOR_MAP[p.color];
            const isYou = youHorse && p.id === youHorse.id;
            return (
              <div
                key={p.id}
                className={[
                  'flex items-center gap-2.5 rounded-2xl border px-3 py-2',
                  isYou
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-100 bg-white text-ink-900',
                ].join(' ')}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.bg} text-sm font-bold text-white shadow ring-2 ring-white/80`}
                >
                  {p.lane + 1}
                </div>
                {p.profileImage ? (
                  <img
                    src={p.profileImage}
                    alt=""
                    className="h-6 w-6 rounded-full ring-1 ring-white/60"
                  />
                ) : null}
                <div className="flex-1 truncate font-medium">
                  {p.name}
                  {p.isBot && (
                    <span
                      className={[
                        'ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wider',
                        isYou ? 'bg-white/15 text-white/70' : 'bg-ink-100 text-ink-400',
                      ].join(' ')}
                    >
                      <Bot size={9} />
                      BOT
                    </span>
                  )}
                </div>
                {p.ready ? (
                  <span
                    className={[
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      isYou
                        ? 'bg-emerald-400 text-emerald-950'
                        : 'bg-emerald-100 text-emerald-700',
                    ].join(' ')}
                  >
                    <Check size={11} strokeWidth={3} />
                    Ready
                  </span>
                ) : (
                  <span
                    className={[
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      isYou ? 'bg-white/15 text-white/70' : 'bg-ink-50 text-ink-400',
                    ].join(' ')}
                  >
                    <Loader2 size={11} className="animate-spin" />
                    Waiting
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Countdown / action */}
        {phase === 'countdown' ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <Timer size={16} />
              <span className="text-sm font-semibold">Race begins in</span>
            </div>
            <div className="font-mono text-3xl font-bold text-emerald-700">
              {remainingSec ?? 0}s
            </div>
          </div>
        ) : youReady ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-400">
            <Loader2 size={14} className="animate-spin" />
            Waiting for {totalCount - readyCount} more rider
            {totalCount - readyCount === 1 ? '' : 's'}…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onReady(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition-transform active:scale-[0.99]"
          >
            <Check size={18} strokeWidth={3} />
            I'm Ready
          </button>
        )}
      </div>
    </div>
  );
}
