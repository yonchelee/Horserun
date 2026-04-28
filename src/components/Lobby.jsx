import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut, Users, Timer, Bot, User, UserX, Shield, X } from 'lucide-react';
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

export default function Lobby({ snapshot, you, serverNow, onReady, onLeave, isAdmin, onReset, onKick }) {
  const phase = snapshot?.phase || 'lobby';
  const countdownEndsAt = snapshot?.countdownEndsAt;
  const totalCount = snapshot?.totalCount ?? 0;
  const humanCount = snapshot?.humanCount ?? 0;
  const readyCount = snapshot?.readyCount ?? 0;
  const botCount = Math.max(0, totalCount - humanCount);
  const youReady = !!you?.ready;

  const [showKickPanel, setShowKickPanel] = useState(false);
  // Confirmation target — when set, a confirm dialog overlays the panel.
  const [kickConfirm, setKickConfirm] = useState(null);
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
      <div className="relative flex w-full max-w-md flex-col gap-3 rounded-3xl border border-ink-100 bg-white px-5 py-4 shadow-xl">
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
              <>
                <button
                  type="button"
                  onClick={() => setShowKickPanel((v) => !v)}
                  className={[
                    'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
                    showKickPanel
                      ? 'bg-ink-900 text-white'
                      : 'bg-ink-50 text-ink-700 hover:bg-ink-100',
                  ].join(' ')}
                >
                  <Shield size={11} />
                  참여자 관리
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200"
                >
                  강제 초기화
                </button>
              </>
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

        {isAdmin && showKickPanel && (
          <KickPanel
            humans={snapshot?.humans || []}
            youConnId={you?.connId}
            onClose={() => setShowKickPanel(false)}
            onAskKick={(target) => setKickConfirm(target)}
          />
        )}

        {kickConfirm && (
          <KickConfirm
            target={kickConfirm}
            onCancel={() => setKickConfirm(null)}
            onConfirm={() => {
              onKick?.(kickConfirm.connId);
              setKickConfirm(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function KickPanel({ humans, youConnId, onClose, onAskKick }) {
  // Self is excluded — admin can't kick themselves. Bots are already
  // excluded server-side (humans list only contains connected humans).
  const others = humans.filter((h) => h.connId !== youConnId);
  return (
    <div className="rounded-2xl border border-ink-100 bg-ink-50 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          참여자 ({humans.length})
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-ink-400 hover:bg-ink-100"
          aria-label="닫기"
        >
          <X size={14} />
        </button>
      </div>
      {others.length === 0 ? (
        <div className="rounded-xl bg-white px-3 py-3 text-center text-[11px] text-ink-400">
          아직 다른 참여자가 없어요.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {others.map((h) => (
            <li
              key={h.connId}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
            >
              {h.profileImage ? (
                <img
                  src={h.profileImage}
                  alt=""
                  className="h-7 w-7 rounded-full ring-1 ring-ink-100"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-700">
                  {h.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <span className="flex-1 truncate font-medium text-ink-900">
                {h.name}
              </span>
              <button
                type="button"
                onClick={() => onAskKick(h)}
                className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
              >
                <UserX size={11} />
                Kick
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KickConfirm({ target, onCancel, onConfirm }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-ink-900/40 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white px-5 py-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-ink-900">
          '{target.name}'을(를) 내보내시겠습니까?
        </div>
        <div className="mt-1 text-[11px] text-ink-400">
          연결이 끊기고 Menu 화면으로 돌아갑니다.
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
          >
            <UserX size={11} />
            내보내기
          </button>
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
