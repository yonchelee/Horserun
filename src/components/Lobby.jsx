import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut, Users, Timer, Bot, User } from 'lucide-react';
import { COLOR_MAP } from './colors.js';
import { YOU_COLOR } from '../game/visible.js';

// Lobby for rooms up to MAX_PLAYERS=150. Showing 150 names doesn't
// scale, so we render:
//   - a single "you" card with the current player's identity + ready state
//   - aggregate counters (total / humans / ready)
//   - countdown timer when running
//   - admin "강제 초기화" button if applicable
//
// `snapshot.you`, `snapshot.totalCount`, `snapshot.humanCount`,
// `snapshot.readyCount` come from the server.

export default function Lobby({ snapshot, you, serverNow, onReady, onLeave, isAdmin, onReset }) {
  const phase = snapshot?.phase || 'lobby';
  const countdownEndsAt = snapshot?.countdownEndsAt;
  const totalCount = snapshot?.totalCount ?? 0;
  const humanCount = snapshot?.humanCount ?? 0;
  const readyCount = snapshot?.readyCount ?? 0;
  const botCount = Math.max(0, totalCount - humanCount);
  const youReady = !!you?.ready;

  const [now, setNow] = useState(() => serverNow?.() ?? Date.now());
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setInterval(() => setNow(serverNow?.() ?? Date.now()), 100);
    return () => clearInterval(id);
  }, [phase, serverNow]);

  const remainingSec =
    phase === 'countdown' && countdownEndsAt
      ? Math.max(0, Math.ceil((countdownEndsAt - now) / 1000))
      : null;

  const youColor = COLOR_MAP[YOU_COLOR];

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-3xl border border-ink-100 bg-white px-5 py-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-400">
            <Users size={14} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
              Lobby
            </span>
          </div>
          <div className="flex items-center gap-1">
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

        {/* You card */}
        {you && (
          <div className="flex items-center gap-3 rounded-2xl border border-ink-900 bg-ink-900 px-4 py-3 text-white">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${youColor.bg} text-sm font-bold text-white shadow ring-2 ring-white/80`}
            >
              {you.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            {you.profileImage ? (
              <img
                src={you.profileImage}
                alt=""
                className="h-8 w-8 rounded-full ring-1 ring-white/60"
              />
            ) : null}
            <div className="flex-1 truncate">
              <div className="font-medium">{you.name}</div>
              <div className="text-[11px] text-white/60">You</div>
            </div>
            {youReady ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-semibold text-emerald-950">
                <Check size={11} strokeWidth={3} />
                Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                <Loader2 size={11} className="animate-spin" />
                Waiting
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={<Users size={12} />} label="참여자" value={totalCount} />
          <Stat icon={<User size={12} />} label="인간" value={humanCount} />
          <Stat icon={<Bot size={12} />} label="봇" value={botCount} />
        </div>
        <div className="text-center text-[11px] font-medium text-ink-400">
          {readyCount} ready
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
          <button
            type="button"
            onClick={() => onReady(false)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-50 px-4 py-3 text-sm font-medium text-ink-500 hover:bg-ink-100"
          >
            <Loader2 size={14} className="animate-spin" />
            Cancel ready
          </button>
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

        <div className="text-center text-[10px] text-ink-400">
          첫 사람이 Ready를 누르면 30초 카운트다운 시작
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-ink-400">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-0.5 text-base font-bold text-ink-900">{value}</div>
    </div>
  );
}
